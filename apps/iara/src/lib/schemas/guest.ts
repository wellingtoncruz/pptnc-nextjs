import { z } from 'zod'

import { TimestampSchema } from './podcast'

// ============================================================================
// LINKEDIN GUEST PROFILE SCHEMA (BrightData API response)
// ============================================================================

/**
 * Schema for the LinkedIn profile data returned by BrightData API.
 * Only validates the fields we actually use — `raw` stores the full response.
 *
 * @see https://docs.brightdata.com/api-reference/web-scraper-api/social-media-apis/linkedin/profiles
 */
export const LinkedInGuestSchema = z.object({
  name: z.string().optional(),
  url: z.string().url().optional(),
  avatar: z.string().url().optional(),
  position: z.string().optional(),
  current_company_name: z.string().optional(),
  about: z.string().optional(),
  city: z.string().optional(),
  country_code: z.string().optional(),
  linkedin_id: z.string().optional(),
})

// ============================================================================
// GUEST DOCUMENT SCHEMA (Firestore subcollection)
// ============================================================================

/**
 * Schema for guest documents in `podcasts/{podcastId}/guests/{docId}`.
 * Stores enriched guest data from LinkedIn scraping.
 */
export const GuestDocSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  avatar: z.string().optional(),
  position: z.string().optional(),
  currentCompanyName: z.string().optional(),
  about: z.string().optional(),
  city: z.string().optional(),
  countryCode: z.string().optional(),
  linkedinId: z.string().optional(),
  photoPath: z.string().optional(),
  raw: z.record(z.string(), z.unknown()),
  scrapedAt: TimestampSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

/**
 * Schema for creating/updating a guest document.
 * Timestamps are handled by the admin function, not the caller.
 */
export const GuestDocCreateSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  avatar: z.string().optional(),
  position: z.string().optional(),
  currentCompanyName: z.string().optional(),
  about: z.string().optional(),
  city: z.string().optional(),
  countryCode: z.string().optional(),
  linkedinId: z.string().optional(),
  photoPath: z.string().optional(),
  raw: z.record(z.string(), z.unknown()),
})

// ============================================================================
// REQUEST SCHEMA
// ============================================================================

/**
 * Schema for POST /api/guests/scrape request body.
 */
export const GuestScrapeRequestSchema = z.object({
  videoId: z.string().min(1),
})
