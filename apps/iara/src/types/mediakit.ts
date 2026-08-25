/**
 * Mediakit contract types (Epic 30) — inferred from the Zod schemas.
 */
import type { z } from 'zod'

import type {
  MediakitAudienceSchema,
  MediakitAudienceWriteSchema,
  MediakitFollowersSchema,
  MediakitSeriesSchema,
  MediakitSeriesWriteSchema,
  MediakitSpotifyDailyPointSchema,
  MediakitStatsSchema,
  MediakitStatsWriteSchema,
  MediakitYoutubeWatchDailyPointSchema,
} from '@/lib/schemas/mediakit'

export type MediakitStats = z.infer<typeof MediakitStatsSchema>
export type MediakitAudience = z.infer<typeof MediakitAudienceSchema>
export type MediakitSeries = z.infer<typeof MediakitSeriesSchema>
export type MediakitFollowers = z.infer<typeof MediakitFollowersSchema>
export type MediakitSpotifyDailyPoint = z.infer<typeof MediakitSpotifyDailyPointSchema>
export type MediakitYoutubeWatchDailyPoint = z.infer<typeof MediakitYoutubeWatchDailyPointSchema>

export type MediakitStatsWrite = z.infer<typeof MediakitStatsWriteSchema>
export type MediakitAudienceWrite = z.infer<typeof MediakitAudienceWriteSchema>
export type MediakitSeriesWrite = z.infer<typeof MediakitSeriesWriteSchema>

/** Complete contract read — the generator's single input. */
export interface MediakitData {
  stats: MediakitStats | null
  audience: MediakitAudience | null
  series: MediakitSeries | null
}
