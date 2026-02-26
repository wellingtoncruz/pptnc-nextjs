import { z } from 'zod'

import { TimestampSchema } from './podcast'

/**
 * AdwordsData schema — persisted in the video document's `adwords` field.
 *
 * Path: `podcasts/{podcastId}/videos/{videoId}` → field `adwords`
 *
 * @see epic-15-trafego-pago.md#Story 15.4
 */
export const AdwordsDataSchema = z.object({
  guide: z.string(),
  keywords: z.array(z.string()),
  generatedAt: TimestampSchema,
  additionalContext: z.string().optional(),
})

/**
 * AdwordsDataCreate schema — for validating POST request body.
 *
 * Excludes `generatedAt` which is set server-side via FieldValue.serverTimestamp().
 */
export const AdwordsDataCreateSchema = AdwordsDataSchema.omit({ generatedAt: true })

/**
 * AdwordsLLMResponse schema — for validating the raw LLM response.
 *
 * Only `guide` (string) and `keywords` (string[]) — no additionalContext or generatedAt.
 */
export const AdwordsLLMResponseSchema = z.object({
  guide: z.string(),
  keywords: z.array(z.string()),
})
