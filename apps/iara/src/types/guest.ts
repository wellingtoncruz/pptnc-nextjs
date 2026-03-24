import type { z } from 'zod'

import type {
  LinkedInGuestSchema,
  GuestDocSchema,
  GuestDocCreateSchema,
  GuestScrapeRequestSchema,
} from '@/lib/schemas/guest'

/**
 * LinkedIn profile data from BrightData API response.
 * Includes _raw with the full unfiltered BrightData response.
 */
export type LinkedInGuestProfile = z.infer<typeof LinkedInGuestSchema> & {
  _raw?: Record<string, unknown>
}

/**
 * Guest document stored in `podcasts/{podcastId}/guests/{docId}`.
 */
export type GuestDoc = z.infer<typeof GuestDocSchema>

/**
 * Input for creating/updating a guest document (without timestamps).
 */
export type GuestDocCreate = z.infer<typeof GuestDocCreateSchema>

/**
 * Request body for POST /api/guests/scrape.
 */
export type GuestScrapeRequest = z.infer<typeof GuestScrapeRequestSchema>
