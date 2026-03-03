import { z } from 'zod'

import { TimestampSchema } from './podcast'

// ============================================================================
// NEWS DOCUMENT SCHEMA (Firestore subcollection)
// ============================================================================

/**
 * Schema for the news source (fonte) embedded map.
 * Uses .catch() for resilience — external pipeline data may have missing fields.
 */
export const NewsSourceSchema = z.object({
  nome: z.string().catch(''),
  url: z.string().catch(''),
})

/**
 * Schema for news documents in `podcasts/{podcastId}/news/{docId}`.
 * Read-only — populated by an external pipeline job.
 * Uses .catch() defaults for text fields to tolerate null/missing values.
 * Only `id` and `importedAt` are strictly required.
 */
export const NewsSchema = z.object({
  id: z.string(),
  titulo: z.string().catch('Sem título'),
  descricao: z.string().catch(''),
  resumo: z.string().catch(''),
  comentarios: z.string().catch(''),
  data: z.string().catch(''),
  fonte: NewsSourceSchema.catch({ nome: '', url: '' }),
  importedAt: TimestampSchema,
  source_email_id: z.string().optional(),
  // Epic 18 — Busca de episódios e redação social
  related_videos: z.array(z.string()).optional(),
  selected_video: z.string().nullable().optional(),
  social: z.string().nullable().optional(),
  // Story 18.8 — Image generation fields
  imageUrl: z.string().optional(),
  imagePrompt: z.string().optional(),
})

// ============================================================================
// API RESPONSE SCHEMA
// ============================================================================

/**
 * Schema for GET /api/news response.
 */
export const NewsListResponseSchema = z.object({
  data: z.object({
    items: z.array(NewsSchema),
    nextCursor: z.string().nullable(),
  }),
})
