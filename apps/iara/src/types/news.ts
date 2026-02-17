import type { z } from 'zod'

import type {
  NewsSchema,
  NewsSourceSchema,
  NewsListResponseSchema,
} from '@/lib/schemas/news'

/**
 * News document from Firestore.
 * Read-only — populated by external pipeline.
 */
export type News = z.infer<typeof NewsSchema>

/**
 * News source (fonte) embedded map.
 */
export type NewsSource = z.infer<typeof NewsSourceSchema>

/**
 * API response for news listing with pagination.
 */
export type NewsListResponse = z.infer<typeof NewsListResponseSchema>
