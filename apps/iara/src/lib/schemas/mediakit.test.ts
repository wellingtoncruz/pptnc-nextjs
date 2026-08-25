import { describe, expect, it } from 'vitest'

import {
  MEDIAKIT_AGE_BUCKETS,
  MediakitAudienceSchema,
  MediakitAudienceWriteSchema,
  MediakitSeriesSchema,
  MediakitSeriesWriteSchema,
  MediakitStatsSchema,
  MediakitStatsWriteSchema,
} from './mediakit'

import {
  MEDIAKIT_SEED_AUDIENCE,
  MEDIAKIT_SEED_SERIES,
  MEDIAKIT_SEED_STATS,
} from '@/lib/mediakit/seed-values'

const mockTimestamp = { toDate: () => new Date('2026-08-25T00:00:00Z') }

describe('MediakitStatsSchema', () => {
  it('accepts the seed values (golden fixture must always be valid)', () => {
    expect(MediakitStatsSchema.safeParse(MEDIAKIT_SEED_STATS).success).toBe(true)
  })

  it('accepts doc metadata (updatedAt + sources)', () => {
    const parsed = MediakitStatsSchema.safeParse({
      ...MEDIAKIT_SEED_STATS,
      updatedAt: mockTimestamp,
      sources: { seed: { updatedAt: mockTimestamp, fields: ['episodes'] } },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects negative counts', () => {
    expect(MediakitStatsSchema.safeParse({ ...MEDIAKIT_SEED_STATS, episodes: -1 }).success).toBe(
      false
    )
  })

  it('rejects non-integer counts', () => {
    expect(MediakitStatsSchema.safeParse({ ...MEDIAKIT_SEED_STATS, cuts: 1.5 }).success).toBe(false)
  })

  it('rejects invalid launch month', () => {
    for (const launch of ['2021-13', '2021-9', 'set/2021', '']) {
      expect(MediakitStatsSchema.safeParse({ ...MEDIAKIT_SEED_STATS, launch }).success).toBe(false)
    }
  })
})

describe('MediakitAudienceSchema', () => {
  it('accepts the seed values', () => {
    expect(MediakitAudienceSchema.safeParse(MEDIAKIT_SEED_AUDIENCE).success).toBe(true)
  })

  it('requires every age bucket of the donut', () => {
    for (const bucket of MEDIAKIT_AGE_BUCKETS) {
      const age = { ...MEDIAKIT_SEED_AUDIENCE.age } as Record<string, number>
      delete age[bucket]
      expect(
        MediakitAudienceSchema.safeParse({ ...MEDIAKIT_SEED_AUDIENCE, age }).success
      ).toBe(false)
    }
  })

  it('rejects percentages above 100', () => {
    expect(
      MediakitAudienceSchema.safeParse({
        ...MEDIAKIT_SEED_AUDIENCE,
        gender: { male: 101, female: 10.4, notSpecified: 5.6 },
      }).success
    ).toBe(false)
  })

  it('requires all four networks on the full doc', () => {
    const { instagram: _instagram, ...incomplete } = MEDIAKIT_SEED_AUDIENCE.followers
    expect(
      MediakitAudienceSchema.safeParse({ ...MEDIAKIT_SEED_AUDIENCE, followers: incomplete })
        .success
    ).toBe(false)
  })
})

describe('MediakitSeriesSchema', () => {
  it('accepts the (provisional, empty) seed series', () => {
    expect(MediakitSeriesSchema.safeParse(MEDIAKIT_SEED_SERIES).success).toBe(true)
  })

  it('accepts sortable YYYY-MM points', () => {
    const parsed = MediakitSeriesSchema.safeParse({
      spotifyMonthly: [
        { month: '2026-06', value: 2400 },
        { month: '2026-07', value: 2700 },
      ],
      youtubeHoursMonthly: [],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects invalid months in points', () => {
    expect(
      MediakitSeriesSchema.safeParse({
        spotifyMonthly: [{ month: '2026-6', value: 1 }],
        youtubeHoursMonthly: [],
      }).success
    ).toBe(false)
  })
})

describe('write schemas (adapter partials)', () => {
  it('stats: accepts a single-field partial and strips unknown keys', () => {
    const parsed = MediakitStatsWriteSchema.parse({ episodes: 240, bogus: true })
    expect(parsed).toEqual({ episodes: 240 })
  })

  it('stats: rejects doc metadata fields (adapters never write them directly)', () => {
    const parsed = MediakitStatsWriteSchema.parse({ updatedAt: mockTimestamp, sources: {} })
    expect(parsed).toEqual({})
  })

  it('audience: accepts a followers subset (BrightData may deliver fewer networks)', () => {
    const parsed = MediakitAudienceWriteSchema.parse({ followers: { tiktok: 3300 } })
    expect(parsed).toEqual({ followers: { tiktok: 3300 } })
  })

  it('audience: demographics only travel whole', () => {
    expect(
      MediakitAudienceWriteSchema.safeParse({ gender: { male: 84 } }).success
    ).toBe(false)
  })

  it('series: accepts one series without the other', () => {
    const parsed = MediakitSeriesWriteSchema.parse({
      youtubeHoursMonthly: [{ month: '2026-07', value: 9800 }],
    })
    expect(parsed.spotifyMonthly).toBeUndefined()
    expect(parsed.youtubeHoursMonthly).toHaveLength(1)
  })
})
