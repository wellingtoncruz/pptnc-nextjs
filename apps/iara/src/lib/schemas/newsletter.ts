import { z } from 'zod'

import { TimestampSchema } from './podcast'

/**
 * Newsletter status — tracks which phase the newsletter has completed.
 */
export const NewsletterStatusSchema = z.enum([
  'idle',
  'draft',
  'news_selected',
  'image_ready',
  'completed',
])

/**
 * Newsletter news item — a curated news item selected for the newsletter.
 */
export const NewsletterNewsItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  source: z.string().optional(),
  url: z.string().optional(),
  publishedAt: z.string().optional(),
})

/**
 * NewsletterData schema — persisted in the video document's `newsletter` field.
 *
 * Path: `podcasts/{podcastId}/videos/{videoId}` → field `newsletter`
 */
export const NewsletterDataSchema = z.object({
  status: NewsletterStatusSchema,
  draft: z.string().optional(),
  news: z.array(NewsletterNewsItemSchema).optional(),
  /** Producer chose to publish this edition without a news section (Fase 2 skipped). */
  newsSkipped: z.boolean().optional(),
  imagePrompt: z.string().optional(),
  imageUrl: z.string().optional(),
  report: z.string().optional(),
  additionalContext: z.string().optional(),
  generatedAt: TimestampSchema.optional(),
})

/**
 * NewsletterDataCreate schema — for validating request body.
 *
 * Excludes `generatedAt` which is set server-side via FieldValue.serverTimestamp().
 */
export const NewsletterDataCreateSchema = NewsletterDataSchema.omit({ generatedAt: true })

/**
 * NewsletterDraftLLMResponse schema — for validating the raw LLM response.
 *
 * Only `draft` (string) — the markdown body of the newsletter.
 */
export const NewsletterDraftLLMResponseSchema = z.object({
  draft: z.string(),
})

/**
 * NewsletterNewsLLMResponse schema — for validating the raw LLM response
 * when selecting the most relevant news for the newsletter.
 *
 * Returns an array of news IDs selected by the LLM.
 */
export const NewsletterNewsLLMResponseSchema = z.object({
  selectedIds: z.array(z.string()),
})

/**
 * NewsletterImageLLMResponse schema — for validating the raw LLM response
 * when generating the image prompt (Chamada 1 of Fase 3).
 *
 * Returns the descriptive prompt to be used for image generation.
 */
export const NewsletterImageLLMResponseSchema = z.object({
  imagePrompt: z.string(),
})

/**
 * NewsletterFormatLLMResponse schema — for validating the raw LLM response
 * when generating the final formatted report (Fase 4).
 *
 * Returns the formatted newsletter report in markdown.
 */
export const NewsletterFormatLLMResponseSchema = z.object({
  report: z.string(),
})
