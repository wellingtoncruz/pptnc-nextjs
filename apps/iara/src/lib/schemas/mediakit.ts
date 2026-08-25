/**
 * Mediakit contract schemas — the Firestore boundary between collectors and
 * the PDF generator (Epic 30, ADR v3 decision #10).
 *
 * Three domain docs under `podcasts/{podcastId}/mediakit/`:
 * - `stats`    — hero numbers of slide 03 + launch date
 * - `audience` — slide 04: subscribers, per-network followers, demographics
 * - `series`   — monthly series feeding the two area charts of slide 03
 *
 * The generator reads ONLY these docs; each collector adapter writes only its
 * own fields (merge). Derived values (peaks, the 69% center, "5 anos", every
 * display format) live in the generator — this contract carries raw data.
 *
 * `views` displayed on the kit = viewsYoutube + viewsSpotifyStreams (decision
 * D6, 2026-08-25) — stored as parcels, summed at render time.
 */
import { z } from 'zod'

import { TimestampSchema } from './podcast'

/** `YYYY-MM`, sortable lexicographically. */
export const MEDIAKIT_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

const nonNegInt = z.number().int().nonnegative()
const percent = z.number().min(0).max(100)

/** Per-adapter write metadata kept on each doc (observability/staleness). */
export const MediakitSourceEntrySchema = z.object({
  updatedAt: TimestampSchema,
  fields: z.array(z.string()),
})

const docMeta = {
  updatedAt: TimestampSchema.optional(),
  sources: z.record(z.string(), MediakitSourceEntrySchema).optional(),
}

export const MediakitStatsSchema = z.object({
  /** "Pessoas impactadas" — channel impressions, all time. The ONLY permanently
   * manual field of the kit (Wellington edits the doc directly — decision D8). */
  impressions: nonNegInt,
  /** YouTube channel total views parcel (collector: youtube). */
  viewsYoutube: nonNegInt,
  /** Spotify show total streams parcel (collector: spotify). */
  viewsSpotifyStreams: nonNegInt,
  episodes: nonNegInt,
  cuts: nonNegInt,
  shorts: nonNegInt,
  /** Total watch hours (YouTube Analytics, minutes/60 floored). */
  watchHours: nonNegInt,
  /** Show launch month — fixed config, feeds the derived "5 anos". */
  launch: z.string().regex(MEDIAKIT_MONTH_REGEX),
  ...docMeta,
})

export const MediakitFollowersSchema = z.object({
  tiktok: nonNegInt,
  linkedin: nonNegInt,
  spotify: nonNegInt,
  instagram: nonNegInt,
})

export const MediakitGenderSchema = z.object({
  male: percent,
  female: percent,
  notSpecified: percent,
})

/** Age buckets exactly as the slide-04 donut (and the Spotify aggregate API). */
export const MEDIAKIT_AGE_BUCKETS = ['18-22', '23-27', '28-34', '35-44', '45-59', '60+'] as const

export const MediakitAgeSchema = z.object(
  Object.fromEntries(MEDIAKIT_AGE_BUCKETS.map((bucket) => [bucket, percent])) as Record<
    (typeof MEDIAKIT_AGE_BUCKETS)[number],
    typeof percent
  >
)

export const MediakitAudienceSchema = z.object({
  youtubeSubscribers: nonNegInt,
  followers: MediakitFollowersSchema,
  /** Demographics source = Spotify for Podcasters aggregate (decision D2). */
  gender: MediakitGenderSchema,
  age: MediakitAgeSchema,
  ...docMeta,
})

export const MediakitSeriesPointSchema = z.object({
  month: z.string().regex(MEDIAKIT_MONTH_REGEX),
  value: z.number().nonnegative(),
})

export const MediakitSeriesSchema = z.object({
  /** Monthly Spotify starts/streams (collector: spotify) — slide 03 left chart. */
  spotifyMonthly: z.array(MediakitSeriesPointSchema),
  /** Monthly YouTube watch hours (collector: youtube) — slide 03 right chart. */
  youtubeHoursMonthly: z.array(MediakitSeriesPointSchema),
  ...docMeta,
})

/**
 * Write schemas — what an adapter may hand to `writeMediakitSection`.
 * Nested partials are explicit (not deepPartial): an adapter may legitimately
 * deliver a subset of followers, but demographics only travel whole.
 */
export const MediakitStatsWriteSchema = MediakitStatsSchema.omit({
  updatedAt: true,
  sources: true,
}).partial()

export const MediakitAudienceWriteSchema = z.object({
  youtubeSubscribers: nonNegInt.optional(),
  followers: MediakitFollowersSchema.partial().optional(),
  gender: MediakitGenderSchema.optional(),
  age: MediakitAgeSchema.optional(),
})

export const MediakitSeriesWriteSchema = z.object({
  spotifyMonthly: z.array(MediakitSeriesPointSchema).optional(),
  youtubeHoursMonthly: z.array(MediakitSeriesPointSchema).optional(),
})

export const MEDIAKIT_SECTION_IDS = ['stats', 'audience', 'series'] as const
export type MediakitSectionId = (typeof MEDIAKIT_SECTION_IDS)[number]
