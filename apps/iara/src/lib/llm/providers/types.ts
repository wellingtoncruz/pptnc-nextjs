/**
 * LLM Provider abstraction — Epic 23 / Story 23.2.
 *
 * Camada que abstrai o cliente LLM concreto (Gemini, Claude…) atrás de uma
 * interface comum. Permite trocar de provider sem reescrever a lógica de
 * negócio (retry, parse JSON, queue, logging) que vive nas camadas acima
 * em `client.ts`.
 *
 * **Escopo do contrato:**
 * - Provider **encapsula** apenas o que diverge entre providers concretos:
 *   transport, auth, request shape, error nativo, token counting.
 * - Provider **NÃO** lida com: retry/backoff (camada `callGenAI`), parse
 *   JSON (`parse-json.ts`), queue (`callLLMQueued`), prompt building
 *   (`prompts.ts`), persistência de LLM logs (camada `callGenAI`).
 *
 * **Forward-compat:**
 * - `streamText` está definido aqui mesmo sem caller hoje. Story 23.3 já
 *   contempla quando ClaudeProvider entrar.
 * - Image generation está fora do contrato — Claude não gera imagem e o
 *   `image-client.ts` continua autônomo, Gemini-only.
 *
 * @see _bmad-output/implementation-artifacts/epic-23-claude-provider.md (ADR-23.1)
 */

import type { DebugContext } from '@/types/llm-log'

/** Nome de provider suportado. */
export type LLMProviderName = 'gemini' | 'claude'

/**
 * Anexo opcional (transcrição, contexto extenso) que cada provider monta
 * no formato nativo:
 * - Gemini: `inlineData` com base64 no parts array
 * - Claude: inline no message content (sem file attachment)
 *
 * `mimeType` ajuda o provider a decidir o handling — para PPTNC sempre é
 * `text/plain` (transcrições), mas o contrato fica aberto pra futuros tipos.
 */
export interface ProviderAttachment {
  mimeType: string
  /** Conteúdo cru (texto). Provider faz base64 / inline conforme necessário. */
  content: string
}

export interface GenerateTextOptions {
  /** System prompt / instruction (papel + objetivo + persona). */
  systemPrompt: string
  /** User message (instrução específica da fase). */
  userPrompt: string
  /** Opcional — transcrição ou contexto longo. */
  attachment?: ProviderAttachment
  /**
   * Override de modelo (ex: 'claude-sonnet-4-6', 'gemini-2.5-pro'). Se ausente,
   * o provider usa `defaultModel`.
   */
  model?: string
  /** Contexto opcional pra LLM logging (passado pelo caller adiante). */
  debugContext?: DebugContext
  /** Timeout em ms. Default 120000. */
  timeoutMs?: number
  /**
   * Sampling temperature (0–1). Quando omitido, o provider usa seu próprio
   * default (Gemini: 0.7; Claude: 1.0 nativo da API). Fases analíticas/extrativas
   * (edit-check, risk, chapters) setam um valor baixo (0.3) pra reduzir
   * não-determinismo e alucinação. @see PHASE_CONFIG em prompts.ts.
   */
  temperature?: number
}

export interface GenerateTextUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface GenerateTextResult {
  /** Texto bruto da resposta. JSON parse fica fora do provider. */
  text: string
  /** Tokens reportados pelo provider (não estimativa). */
  usage: GenerateTextUsage
  /** Custo estimado em USD baseado no pricing do provider. Zero se desconhecido. */
  estimatedCostUsd: number
  /** Latência efetiva da chamada (sem retry externo). */
  latencyMs: number
  /** Modelo de fato usado (após resolver `options.model` ou default). */
  modelUsed: string
}

export type StreamTextOptions = GenerateTextOptions

/**
 * Eventos do stream em shape unificado entre providers. Caller monta o
 * texto acumulado a partir de `delta`.
 */
export type LLMStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; usage: GenerateTextUsage; estimatedCostUsd: number; modelUsed: string }
  | { type: 'error'; code: string; message: string; retryable: boolean }

/**
 * Contrato do provider. Implementações devem ser **stateless por chamada**
 * (mas podem ter singleton de client interno). Erros nativos do SDK são
 * mapeados pra `LLMError` antes de propagar — caller pode confiar em codes.
 */
export interface LLMProvider {
  /** Identificador estável (usado em logs, telemetria). */
  readonly name: LLMProviderName
  /** Modelo default quando `options.model` é omitido. */
  readonly defaultModel: string

  /**
   * Chamada síncrona (consumindo stream internamente se for o caso) que
   * retorna o texto completo + usage + cost. **Sem retry interno** — caller
   * é responsável pela política de retry.
   */
  generateText(opts: GenerateTextOptions): Promise<GenerateTextResult>

  /**
   * Chamada streaming. Caller consome via `for await`. Encerra com evento
   * `done` (sucesso) ou `error` (falha terminal). **Sem retry interno.**
   */
  streamText(opts: StreamTextOptions): AsyncIterable<LLMStreamEvent>

  /**
   * Estimativa síncrona pré-chamada. Provider usa heurística (chars/4 pra
   * PT-BR) ou tokenizer nativo se disponível. Não chama API.
   *
   * Usado pelo cost estimator (Story 23.5) e pra guard contra estourar
   * context window antes da chamada (Story 23.3).
   */
  estimateTokens(text: string): number
}
