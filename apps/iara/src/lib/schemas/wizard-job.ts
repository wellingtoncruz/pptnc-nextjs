import { z } from 'zod'

/**
 * Schema for async wizard phase processing jobs stored in Firestore.
 *
 * Path: `podcasts/{podcastId}/videos/{videoId}/wizardJobs/{jobId}`
 *
 * Async flow:
 * 1. Frontend POST → handler creates job (status='pending'), returns 202+jobId
 * 2. Background worker processes LLM (status='processing')
 * 3. On complete: persists result to video doc + sets status='complete'
 * 4. Frontend listens via onSnapshot to receive completion signal
 *
 * The job document is a signaling channel — final phase data still lives
 * in the parent video document (e.g., `editingIssues`, `chapters`).
 */

export const WizardJobStatusSchema = z.enum(['pending', 'processing', 'complete', 'failed'])

export const WizardJobPhaseSchema = z.union([
  z.literal('critique'),
  z.literal('edit-check'),
  z.literal('risk'),
  z.literal('chapters'),
  z.literal('title'),
  z.literal('short-title'),
  z.literal('description'),
  z.literal('tags'),
  // Epic 22 / Story 22.4 — geração de thumbnail via Vertex AI (Gemini image).
  z.literal('thumbnail'),
])

const WizardJobErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean().default(false),
})

const WizardJobUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
})

const TimestampLikeSchema = z.custom<{ toDate(): Date }>(
  (val) => val !== null && typeof val === 'object' && 'toDate' in val
)

/**
 * Schema for creating a new job (initial pending state).
 */
export const WizardJobCreateSchema = z.object({
  videoId: z.string().min(1),
  phase: WizardJobPhaseSchema,
  additionalContext: z.string().optional(),
  promptOverride: z.string().optional(),
})

/**
 * Schema for an in-flight or completed job (read from Firestore).
 *
 * `result` is intentionally permissive (z.unknown()) — the consumer
 * narrows by `phase` and casts to the appropriate PhaseNResponse type.
 */
export const WizardJobSchema = WizardJobCreateSchema.extend({
  id: z.string().min(1),
  status: WizardJobStatusSchema,
  result: z.unknown().optional(),
  usage: WizardJobUsageSchema.optional(),
  error: WizardJobErrorSchema.optional(),
  createdAt: TimestampLikeSchema,
  updatedAt: TimestampLikeSchema,
})

/**
 * Schema for partial updates during processing.
 */
export const WizardJobUpdateSchema = z.object({
  status: WizardJobStatusSchema.optional(),
  result: z.unknown().optional(),
  usage: WizardJobUsageSchema.optional(),
  error: WizardJobErrorSchema.optional(),
})
