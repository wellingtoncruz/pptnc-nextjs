import { z } from 'zod'

import { TimestampSchema } from './podcast'

// ============================================================================
// LINKEDIN GUEST PROFILE SCHEMA (BrightData API response)
// ============================================================================

/**
 * BrightData represents "no value" as `null`, not as an absent key — for ANY
 * field, scalar or nested. A plain `.optional()` accepts `undefined` but bounces
 * on `null`, and because the parse is all-or-nothing a single null field
 * discards the whole (already paid for) profile.
 *
 * Verified in production: `position: null` alone killed 9 scrapes between
 * 2026-06-23 and 2026-07-21 (8 distinct guests), plus `about: null` on one of
 * them. The Epic 24 fix (`1a24ee1`) had covered only the nested
 * `current_company` / `experience` and left every flat field exposed.
 *
 * We accept null on input and normalize it back to `undefined` on output, so
 * the inferred type stays `string | undefined` and no consumer changes —
 * `GuestDocCreateSchema` rejects null, and `upsertGuest` strips only undefined
 * before writing to Firestore.
 */
const nullableString = () => z.string().nullish().transform((v) => v ?? undefined)
const nullableUrl = () => z.string().url().nullish().transform((v) => v ?? undefined)

/**
 * Schema for the LinkedIn profile data returned by BrightData API.
 * Only validates the fields we actually use — `raw` stores the full response.
 *
 * @see https://docs.brightdata.com/api-reference/web-scraper-api/social-media-apis/linkedin/profiles
 */
export const LinkedInGuestSchema = z.object({
  name: nullableString(),
  url: nullableUrl(),
  avatar: nullableUrl(),
  /**
   * `position` is the title we use to populate "Cargo" in Phase 1. The
   * BrightData payload may surface it as a flat string OR nested inside
   * `current_company.title` / `experience[0].title` — `parseProfileData`
   * derives a single normalized value before returning.
   */
  position: nullableString(),
  current_company_name: nullableString(),
  /**
   * Optional nested object alongside current_company_name. BrightData may omit
   * the field entirely OR send `null` (e.g., when the profile has no current
   * company) — `.nullish()` accepts both undefined and null without bouncing.
   */
  current_company: z
    .object({
      title: z.string().nullish(),
      position: z.string().nullish(),
      name: z.string().nullish(),
    })
    .passthrough()
    .nullish(),
  /**
   * Optional experience array. BrightData sends `experience: null` for some
   * profiles (verified 2026-05-17 with luisrudi). `.nullish()` lets the parse
   * pass through; downstream derivation already uses optional chaining.
   */
  experience: z
    .array(
      z
        .object({
          title: z.string().nullish(),
          position: z.string().nullish(),
          company: z.string().nullish(),
        })
        .passthrough()
    )
    .nullish(),
  about: nullableString(),
  city: nullableString(),
  country_code: nullableString(),
  linkedin_id: nullableString(),
  /** Numeric LinkedIn member ID — usable as urn:li:person:{linkedin_num_id} for API mentions */
  linkedin_num_id: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => v ?? undefined),
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
