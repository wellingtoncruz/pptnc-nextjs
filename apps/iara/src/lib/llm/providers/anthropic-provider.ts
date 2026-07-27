/**
 * AnthropicProvider — Claude via Anthropic API direta.
 *
 * Implementação do `LLMProvider` para a família Claude (Sonnet 4.6/5, Opus
 * 4.7/4.8/5, Haiku 4.5). Encapsula:
 * - Cliente `Anthropic` SDK (singleton, API key Bearer)
 * - Request shape específico (`messages.create`, `system` inline)
 * - Stream consumption (Anthropic stream events)
 * - Token counting heurístico (`chars/4` em PT-BR)
 * - Error mapping nativo → `LLMError`
 *
 * **Provider escolhido pelo Epic 23 spike (2026-05-15):** Anthropic API direta
 * em vez de Vertex AI. Driver: -10% custo, sem allowlist publisher, SDK
 * mainstream, potencial cobertura via créditos programáticos do plano Max 5x
 * a partir de 15-jun-2026.
 *
 * **Não importar diretamente em código de aplicação** — use `getAnthropicProvider()`.
 * Tests podem chamar `resetAnthropicProvider()` em `beforeEach` pra forçar
 * reinstanciação (mesmo padrão do `resetGeminiProvider`).
 *
 * @see providers/gemini-provider.ts (par)
 * @see providers/types.ts (contrato comum)
 * @see _bmad-output/implementation-artifacts/epic-23-claude-provider.md (Story 23.3)
 */

import Anthropic from '@anthropic-ai/sdk'

import { log } from '@/lib/logger'

import { LLMError, createLLMError } from '../errors'
import { supportsTemperature } from '../models'

import type {
  GenerateTextOptions,
  GenerateTextResult,
  GenerateTextUsage,
  LLMProvider,
  LLMStreamEvent,
  ProviderAttachment,
  StreamTextOptions,
} from './types'

/**
 * Pricing por modelo (USD por 1M tokens). Auditado em 2026-07-27 contra a doc
 * oficial da Anthropic. O `claude-opus-4-7` estava a $15/$75 — preço do Opus
 * **4.1** (depreciado), não do 4.7. Manter em sincronia com a tabela gêmea em
 * `cost-estimator.ts`.
 */
const PRICING_USD_PER_M: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
}

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6'

/**
 * Teto de tokens de saída por request.
 *
 * Era 8192. Subiu para 16000 em 2026-07-27 ao adicionar Opus 5 e Sonnet 5 ao
 * catálogo: nesses modelos o *adaptive thinking* vem **ligado por padrão** e o
 * raciocínio consome o MESMO `max_tokens` da resposta. Com o teto antigo, uma
 * fase que gerasse bastante raciocínio poderia estourar o limite antes de
 * fechar o JSON — o resultado seria `stop_reason: 'max_tokens'` e um payload
 * truncado no meio, que quebra o parse da fase.
 *
 * É um teto, não um alvo: não altera o tamanho típico das respostas nem o custo
 * das fases que já cabiam em 8192. 16000 mantém a request abaixo do limite de
 * timeout HTTP do SDK no caminho não-streaming (`generateText`).
 */
const MAX_OUTPUT_TOKENS = 16000

/**
 * Monta o bloco de sampling da request, omitindo `temperature` nos modelos que
 * a rejeitam.
 *
 * A Anthropic removeu os parâmetros de sampling a partir do Opus 4.7 — mandar
 * `temperature` para Opus 4.7/4.8/5 ou Sonnet 5 devolve **HTTP 400**, o que
 * quebraria as fases `edit-check`, `risk` e `chapters` (as três mandam 0.3).
 * Omitir é a única saída sem tirar esses modelos do catálogo; a contenção de
 * alucinação nessas fases passa a depender só do prompt, e o produtor é avisado
 * disso na tela de Configuração (`llm-config-settings-form`).
 *
 * O log registra a omissão para que a mudança de comportamento seja auditável
 * — um parâmetro que some em silêncio é exatamente o tipo de troca invisível
 * que já nos custou um incidente (ver `lesson_preview_model_retirement`).
 */
function buildSamplingParams(
  model: string,
  temperature: number | undefined
): { temperature?: number } {
  if (temperature === undefined) return {}
  if (supportsTemperature(model)) return { temperature }

  log('INFO', 'AnthropicProvider: temperature omitida (modelo não suporta sampling params)', {
    model,
    requestedTemperature: temperature,
  })
  return {}
}

function calculateCost(model: string, usage: GenerateTextUsage): number {
  const tier = PRICING_USD_PER_M[model]
  if (!tier) return 0
  return (usage.promptTokens / 1_000_000) * tier.input + (usage.completionTokens / 1_000_000) * tier.output
}

let providerInstance: AnthropicProvider | undefined

/** Singleton accessor. Lazy init — ler `ANTHROPIC_API_KEY` só quando necessário. */
export function getAnthropicProvider(): AnthropicProvider {
  if (!providerInstance) {
    providerInstance = new AnthropicProvider()
  }
  return providerInstance
}

/** @internal — usado apenas em tests pra forçar reinstanciação. */
export function resetAnthropicProvider(): void {
  providerInstance = undefined
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'claude' as const

  get defaultModel(): string {
    return DEFAULT_CLAUDE_MODEL
  }

  private client: Anthropic

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new LLMError(
        'API_ERROR',
        'ANTHROPIC_API_KEY ausente. Configure em .env.local ou Cloud Run secret.',
        false
      )
    }
    this.client = new Anthropic({ apiKey })
  }

  async generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
    const model = opts.model ?? this.defaultModel
    const userContent = this.buildUserContent(opts.userPrompt, opts.attachment)
    const t0 = Date.now()

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: opts.systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        // Só seta temperature quando o caller especifica E o modelo aceita.
        // Omitido → default nativo da API (1.0). Fases analíticas passam 0.3
        // pra reduzir alucinação — ver `buildSamplingParams`.
        ...buildSamplingParams(model, opts.temperature),
      })

      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => ('text' in b ? b.text : ''))
        .join('')

      const usage: GenerateTextUsage = {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      }
      const latencyMs = Date.now() - t0

      log('INFO', 'AnthropicProvider.generateText completed', {
        model,
        temperature:
          opts.temperature === undefined
            ? 'default(1.0)'
            : supportsTemperature(model)
              ? opts.temperature
              : `omitida (pedida ${opts.temperature}; modelo não suporta)`,
        responseLength: text.length,
        ...usage,
        latencyMs,
      })

      if (!text) {
        throw new LLMError('INVALID_RESPONSE', 'Nenhum texto na resposta do Claude', false)
      }

      return {
        text,
        usage,
        estimatedCostUsd: calculateCost(model, usage),
        latencyMs,
        modelUsed: model,
      }
    } catch (error) {
      if (error instanceof LLMError) throw error
      throw this.mapError(error)
    }
  }

  async *streamText(opts: StreamTextOptions): AsyncIterable<LLMStreamEvent> {
    const model = opts.model ?? this.defaultModel
    const userContent = this.buildUserContent(opts.userPrompt, opts.attachment)

    try {
      const stream = await this.client.messages.stream({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: opts.systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        ...buildSamplingParams(model, opts.temperature),
      })

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'delta', text: event.delta.text }
        }
      }

      const finalMessage = await stream.finalMessage()
      const usage: GenerateTextUsage = {
        promptTokens: finalMessage.usage.input_tokens,
        completionTokens: finalMessage.usage.output_tokens,
        totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
      }
      yield {
        type: 'done',
        usage,
        estimatedCostUsd: calculateCost(model, usage),
        modelUsed: model,
      }
    } catch (error) {
      const llmError = error instanceof LLMError ? error : this.mapError(error)
      yield {
        type: 'error',
        code: llmError.code,
        message: llmError.message,
        retryable: llmError.retryable,
      }
    }
  }

  /**
   * Mesma heurística que o GeminiProvider (chars/4 em PT-BR). Anthropic tem
   * `client.messages.countTokens()` mas custa 1 chamada a mais; Story 23.5
   * pode considerar usar pra estimate exato em UI.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  /**
   * Mapeia erros Anthropic-specific pro `LLMError` interno. Antrophic SDK
   * lança `APIError` com `.status` HTTP — usamos isso pra distinguir.
   */
  private mapError(error: unknown): LLMError {
    const e = error as { status?: number; message?: string; name?: string }
    const status = e.status
    const message = e.message ?? 'Erro desconhecido do Claude'

    // 429 → RATE_LIMIT (retryable)
    if (status === 429) {
      return new LLMError('RATE_LIMIT', `Claude rate limit: ${message}`, true)
    }
    // 401/403 → API_ERROR (não retryable; auth quebrada)
    if (status === 401 || status === 403) {
      return new LLMError('API_ERROR', `Claude auth: ${message}`, false)
    }
    // 408 / 504 → TIMEOUT
    if (status === 408 || status === 504) {
      return new LLMError('TIMEOUT', `Claude timeout: ${message}`, true)
    }
    // 5xx genérico → API_ERROR retryable
    if (status && status >= 500) {
      return new LLMError('API_ERROR', `Claude server error ${status}: ${message}`, true)
    }
    // Outros → delega createLLMError
    return createLLMError(error)
  }

  /**
   * Claude não tem file attachment como o Gemini. Transcrição vai inline no
   * content do user message, delimitada pra o modelo entender o boundary.
   */
  private buildUserContent(userPrompt: string, attachment: ProviderAttachment | undefined): string {
    if (!attachment) return userPrompt
    return `${userPrompt}\n\n---ANEXO (${attachment.mimeType})---\n${attachment.content}\n---FIM ANEXO---`
  }
}
