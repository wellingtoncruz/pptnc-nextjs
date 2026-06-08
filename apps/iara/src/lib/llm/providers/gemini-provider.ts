/**
 * GeminiProvider — Google Gemini via Vertex AI.
 *
 * Implementação do `LLMProvider` para a família Gemini. Encapsula:
 * - Cliente `GoogleGenAI` (singleton, ADC via Vertex AI)
 * - Request shape específico (`responseMimeType`, `thinkingConfig`)
 * - Stream consumption (Gemini sempre retorna stream)
 * - Token counting heurístico (será refinado com `countTokens` API na Story 23.5)
 * - Error mapping nativo → `LLMError`
 *
 * **Não importar diretamente em código de aplicação** — use `getGeminiProvider()`.
 * Tests podem chamar `resetGeminiProvider()` em `beforeEach` pra forçar
 * reinstanciação (mesmo padrão do `resetGenAIClient` legacy).
 *
 * @see providers/types.ts (contrato)
 * @see _bmad-output/implementation-artifacts/epic-23-claude-provider.md (Story 23.2)
 */

import { GoogleGenAI } from '@google/genai'

import { PROJECT_ID, VERTEX_AI_LOCATION, VERTEX_AI_MODEL } from '@/lib/firebase/config'
import { log } from '@/lib/logger'

import { LLMError, createLLMError } from '../errors'
import { DEFAULT_TEXT_MODEL } from '../models'

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
 * Pricing por modelo (USD por 1M tokens). Usado pra `estimatedCostUsd` em
 * cada chamada. Numbers conforme [Vertex AI pricing 2026-05].
 */
const PRICING_USD_PER_M: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash': { input: 0.075, output: 0.3 },
  'gemini-2.0-flash-lite': { input: 0.05, output: 0.2 },
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.5-flash-lite': { input: 0.05, output: 0.2 },
  'gemini-2.5-pro': { input: 1.25, output: 5 },
  'gemini-3.1-pro-preview': { input: 2, output: 10 }, // estimativa preview
  'gemini-3-flash-preview': { input: 0.1, output: 0.4 }, // estimativa preview
  'gemini-3.1-flash-lite-preview': { input: 0.05, output: 0.2 }, // estimativa preview
}

function calculateCost(model: string, usage: GenerateTextUsage): number {
  const tier = PRICING_USD_PER_M[model]
  if (!tier) return 0
  return (usage.promptTokens / 1_000_000) * tier.input + (usage.completionTokens / 1_000_000) * tier.output
}

let providerInstance: GeminiProvider | undefined

/**
 * Singleton accessor. Lazy initialization preserva o pattern atual do `getAI()`
 * e mantém mocks de `@google/genai` em testes existentes funcionando sem mudança.
 */
export function getGeminiProvider(): GeminiProvider {
  if (!providerInstance) {
    providerInstance = new GeminiProvider()
  }
  return providerInstance
}

/** @internal — usado apenas em tests pra forçar reinstanciação. */
export function resetGeminiProvider(): void {
  providerInstance = undefined
}

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini' as const

  /**
   * Resolve o modelo default: prioriza env `VERTEX_AI_MODEL` (override
   * operacional), depois `DEFAULT_TEXT_MODEL` do registry. Mesma ordem
   * do client.ts legacy.
   */
  get defaultModel(): string {
    return VERTEX_AI_MODEL || DEFAULT_TEXT_MODEL
  }

  private client: GoogleGenAI

  constructor() {
    this.client = new GoogleGenAI({
      vertexai: true,
      project: PROJECT_ID,
      location: VERTEX_AI_LOCATION,
    })
  }

  async generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
    const model = opts.model ?? this.defaultModel
    const parts = this.buildParts(opts.userPrompt, opts.attachment)
    const t0 = Date.now()

    try {
      const stream = await this.client.models.generateContentStream({
        model,
        contents: parts,
        config: {
          systemInstruction: opts.systemPrompt,
          responseMimeType: 'application/json',
          // Caller pode sobrescrever (fases analíticas usam 0.3); default 0.7.
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 24576 },
        },
      })

      let fullText = ''
      let chunkCount = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- chunk inferred from SDK
      let lastChunk: any
      for await (const chunk of stream) {
        chunkCount++
        lastChunk = chunk
        if (chunk.text) fullText += chunk.text
      }

      const usageMetadata = lastChunk?.usageMetadata
      const usage: GenerateTextUsage = {
        promptTokens: usageMetadata?.promptTokenCount || 0,
        completionTokens: usageMetadata?.candidatesTokenCount || 0,
        totalTokens: usageMetadata?.totalTokenCount || 0,
      }
      const latencyMs = Date.now() - t0

      log('INFO', 'GeminiProvider.generateText completed', {
        model,
        temperature: opts.temperature ?? 0.7,
        chunkCount,
        responseLength: fullText.length,
        ...usage,
        latencyMs,
      })

      if (!fullText) {
        throw new LLMError('INVALID_RESPONSE', 'Nenhum texto na resposta do Gemini', false)
      }

      return {
        text: fullText,
        usage,
        estimatedCostUsd: calculateCost(model, usage),
        latencyMs,
        modelUsed: model,
      }
    } catch (error) {
      if (error instanceof LLMError) throw error
      throw createLLMError(error)
    }
  }

  async *streamText(opts: StreamTextOptions): AsyncIterable<LLMStreamEvent> {
    const model = opts.model ?? this.defaultModel
    const parts = this.buildParts(opts.userPrompt, opts.attachment)

    try {
      const stream = await this.client.models.generateContentStream({
        model,
        contents: parts,
        config: {
          systemInstruction: opts.systemPrompt,
          responseMimeType: 'application/json',
          // Caller pode sobrescrever (fases analíticas usam 0.3); default 0.7.
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: 65536,
          thinkingConfig: { thinkingBudget: 24576 },
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- chunk inferred from SDK
      let lastChunk: any
      for await (const chunk of stream) {
        lastChunk = chunk
        if (chunk.text) {
          yield { type: 'delta', text: chunk.text }
        }
      }

      const usageMetadata = lastChunk?.usageMetadata
      const usage: GenerateTextUsage = {
        promptTokens: usageMetadata?.promptTokenCount || 0,
        completionTokens: usageMetadata?.candidatesTokenCount || 0,
        totalTokens: usageMetadata?.totalTokenCount || 0,
      }
      yield {
        type: 'done',
        usage,
        estimatedCostUsd: calculateCost(model, usage),
        modelUsed: model,
      }
    } catch (error) {
      const llmError = error instanceof LLMError ? error : createLLMError(error)
      yield {
        type: 'error',
        code: llmError.code,
        message: llmError.message,
        retryable: llmError.retryable,
      }
    }
  }

  /**
   * Heurística simples: ~4 chars por token em PT-BR. Refinar com
   * `client.models.countTokens()` na Story 23.5 (cost estimator).
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  private buildParts(
    userPrompt: string,
    attachment: ProviderAttachment | undefined
  ): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: userPrompt },
    ]
    if (attachment) {
      const base64 = Buffer.from(attachment.content, 'utf-8').toString('base64')
      parts.push({
        inlineData: {
          mimeType: attachment.mimeType,
          data: base64,
        },
      })
    }
    return parts
  }
}
