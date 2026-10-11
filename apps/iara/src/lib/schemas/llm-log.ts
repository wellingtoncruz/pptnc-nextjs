import { z } from 'zod'

/**
 * Schema for LLM debug log entries stored in Firestore.
 *
 * Path: `podcasts/{podcastId}/llmLogs/{logId}`
 *
 * @see 15-10-observabilidade-llm-debug-logs.md
 */
export const LlmLogCreateSchema = z.object({
  component: z.string().min(1),
  model: z.string().min(1),
  videoId: z.string().min(1),
  videoType: z.enum(['episode', 'cut', 'reel']),
  prompt: z.object({
    system: z.string(),
    user: z.string(),
  }),
  response: z.string(),
  /** Attachment info (transcription file sent to the LLM). */
  attachment: z.object({
    sizeKB: z.number().nonnegative(),
    estimatedTokens: z.number().int().nonnegative(),
  }).optional(),
  /** Token usage reported by the LLM API. */
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }).optional(),
  /** Provider que serviu a chamada. Docs legacy assumem `gemini`. */
  provider: z.enum(['gemini', 'claude']).default('gemini').catch('gemini'),
  /** Custo estimado em USD calculado pelo provider. Legacy = 0. */
  estimatedCostUsd: z.number().nonnegative().default(0).catch(0),
  /** Flag opcional indicando se a chamada se beneficiou de prompt caching. */
  cacheHit: z.boolean().optional(),
  /**
   * Presente quando a chamada falhou (out/2026). Sem isso a aba de depuração
   * só mostrava as chamadas que deram certo. `response` traz o que o modelo
   * devolveu (PARSE_ERROR) ou fica vazio (erro antes da resposta).
   */
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
  }).optional(),
})

/**
 * Full LLM log schema including Firestore-generated fields.
 */
export const LlmLogSchema = LlmLogCreateSchema.extend({
  id: z.string().min(1),
  createdAt: z.union([
    z.string(),
    z.custom<{ toDate(): Date }>((val) => val !== null && typeof val === 'object' && 'toDate' in val),
  ]),
})
