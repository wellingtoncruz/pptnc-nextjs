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
