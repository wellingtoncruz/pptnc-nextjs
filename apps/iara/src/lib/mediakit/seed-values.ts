/**
 * Mediakit seed values — the numbers currently printed on the design
 * (`midiakit_sources/standalone.html`, re-export of 2026-08-25, 11 slides).
 *
 * Double duty:
 * 1. Seed for the dev `mediakit` collection (scripts/seed-mediakit.ts).
 * 2. Golden fixture for the binding engine (story 30.2): binding the template
 *    with THESE values must reproduce the template byte-for-byte.
 *
 * Value provenance:
 * - Counts/subscribers/followers/demographics: read off the design (confirmed
 *   correct by Wellington on 2026-08-25 — the June scratchpad was stale).
 * - viewsSpotifyStreams: real value from the Spotify spike (2026-08-25).
 * - viewsYoutube: fixture chosen so viewsYoutube + viewsSpotifyStreams formats
 *   to the "2,65 mi" printed on slide 03 (D6: views = YT + Spotify). The
 *   collector replaces it with the real parcel on first run.
 * - impressions: display value "4,3 mi" — Wellington owns the exact number
 *   (manual field, decision D8).
 * - Series: PROVISIONAL empty — stored DAILY at source granularity (raw
 *   fields, architectural correction 2026-08-25). Real data arrives via the
 *   collectors' HISTORICAL BACKFILL (30.5/30.6); the golden fixture for the
 *   charts (30.3) reverse-engineers the monthly aggregation the design shows.
 */
import type { MediakitAudience, MediakitSeries, MediakitStats } from '@/types/mediakit'

type SeedDoc<T> = Omit<T, 'updatedAt' | 'sources'>

export const MEDIAKIT_SEED_STATS: SeedDoc<MediakitStats> = {
  impressions: 4_300_000,
  viewsYoutube: 2_590_000,
  viewsSpotifyStreams: 57_592,
  episodes: 234,
  cuts: 1_170,
  shorts: 1_872,
  watchHours: 172_000,
  launch: '2021-09',
}

export const MEDIAKIT_SEED_AUDIENCE: SeedDoc<MediakitAudience> = {
  youtubeSubscribers: 34_076,
  followers: {
    tiktok: 3_293,
    linkedin: 3_228,
    spotify: 3_325,
    instagram: 1_241,
  },
  gender: { male: 84, female: 10.4, notSpecified: 5.6 },
  age: {
    '18-22': 1.9,
    '23-27': 11.6,
    '28-34': 16.8,
    '35-44': 43.7,
    '45-59': 25.3,
    '60+': 0.6,
  },
}

export const MEDIAKIT_SEED_SERIES: SeedDoc<MediakitSeries> = {
  spotifyDaily: [],
  youtubeDaily: [],
}
