/**
 * AnthropicProvider — Claude via Anthropic API direta.
 *
 * Implementação do `LLMProvider` para a família Claude (Sonnet 4.6, Opus 4.7,
 * Haiku 4.5). Encapsula:
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
 * Pricing por modelo (USD por 1M tokens). Numbers conforme [Anthropic pricing
 * 2026-05-14]. Pricing parity com Vertex global; Vertex regional adicionaria +10%.
 */
const PRICING_USD_PER_M: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
}

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6'

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
        max_tokens: 8192,
        system: opts.systemPrompt,
        messages: [{ role: 'user', content: userContent }],
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
        max_tokens: 8192,
        system: opts.systemPrompt,
        messages: [{ role: 'user', content: userContent }],
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
