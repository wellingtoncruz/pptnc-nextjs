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
  /**
   * `position` is the title we use to populate "Cargo" in Phase 1. The
   * BrightData payload may surface it as a flat string OR nested inside
   * `current_company.title` / `experience[0].title` — `parseProfileData`
   * derives a single normalized value before returning.
   */
  position: z.string().optional(),
  current_company_name: z.string().optional(),
  /** Optional nested object some BrightData payloads include alongside current_company_name. */
  current_company: z
    .object({
      title: z.string().optional(),
      position: z.string().optional(),
      name: z.string().optional(),
    })
    .passthrough()
    .optional(),
  /** Optional experience array — first entry is the current/most recent role. */
  experience: z
    .array(
      z
        .object({
          title: z.string().optional(),
          position: z.string().optional(),
          company: z.string().optional(),
        })
        .passthrough()
    )
    .optional(),
  about: z.string().optional(),
  city: z.string().optional(),
  country_code: z.string().optional(),
  linkedin_id: z.string().optional(),
  /** Numeric LinkedIn member ID — usable as urn:li:person:{linkedin_num_id} for API mentions */
  linkedin_num_id: z.union([z.string(), z.number()]).optional(),
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
  /** Numeric LinkedIn member ID — usable as urn:li:person:{linkedinNumId} for API mentions */
  linkedinNumId: z.union([z.string(), z.number()]).optional(),
  /** Legacy: relative path served from public/guests filesystem (Cloud Run efêmero — Story 24.2 retira). */
  photoPath: z.string().optional(),
  /** GCS path under guest-avatars/. Served via /api/guests/[guestKey]/avatar proxy. (Story 24.2) */
  avatarGcsPath: z.string().optional(),
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
  /** Numeric LinkedIn member ID — usable as urn:li:person:{linkedinNumId} for API mentions */
  linkedinNumId: z.union([z.string(), z.number()]).optional(),
  /** Legacy: relative path served from public/guests filesystem (Cloud Run efêmero — Story 24.2 retira). */
  photoPath: z.string().optional(),
  /** GCS path under guest-avatars/. Served via /api/guests/[guestKey]/avatar proxy. (Story 24.2) */
  avatarGcsPath: z.string().optional(),
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
  /** When provided, only scrape these specific LinkedIn URLs (instead of all guests) */
  linkedinUrls: z.array(z.string().url()).optional(),
})
