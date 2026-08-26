import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadMediakit = vi.fn()
vi.mock('@/lib/firebase/mediakit-admin', () => ({
  readMediakit: () => mockReadMediakit(),
}))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import {
  ageSharesFromAggregate,
  genderSharesFromAggregate,
  spotifyAdapter,
  SpotifyCredentialsExpired,
  yearChunks,
} from './spotify'

// Real shapes from the 2026-08-25 spike against the live show.
const AGGREGATE_FIXTURE = {
  count: 1910,
  ageFacetedCounts: {
    '0-17': { counts: { NON_BINARY: 0, FEMALE: 0, NOT_SPECIFIED: 0, MALE: 0 } },
    '18-22': { counts: { NON_BINARY: 0, FEMALE: 4, NOT_SPECIFIED: 22, MALE: 6 } },
    '23-27': { counts: { NON_BINARY: 0, FEMALE: 19, NOT_SPECIFIED: 1, MALE: 113 } },
    '28-34': { counts: { NON_BINARY: 0, FEMALE: 49, NOT_SPECIFIED: 1, MALE: 371 } },
    '35-44': { counts: { NON_BINARY: 0, FEMALE: 100, NOT_SPECIFIED: 18, MALE: 716 } },
    '45-59': { counts: { NON_BINARY: 0, FEMALE: 48, NOT_SPECIFIED: 4, MALE: 414 } },
    '60-150': { counts: { NON_BINARY: 0, FEMALE: 11, NOT_SPECIFIED: 0, MALE: 13 } },
  },
  genderedCounts: { counts: { NON_BINARY: 0, FEMALE: 231, NOT_SPECIFIED: 46, MALE: 1633 } },
}

describe('demographic transforms (spike fixtures)', () => {
  it('gender shares: pt percentages with NOT_SPECIFIED+NON_BINARY merged', () => {
    const shares = genderSharesFromAggregate(AGGREGATE_FIXTURE.genderedCounts)
    expect(shares).toEqual({ male: 85.5, female: 12.1, notSpecified: 2.4 })
  })

  it('age shares: donut buckets, 60-150→60+, 0-17 excluded, renormalized', () => {
    const shares = ageSharesFromAggregate(AGGREGATE_FIXTURE.ageFacetedCounts)
    expect(shares['35-44']).toBeCloseTo(43.7, 1)
    expect(shares['60+']).toBeCloseTo(1.3, 1)
    const sum = Object.values(shares).reduce((a, b) => a + b, 0)
    expect(sum).toBeGreaterThan(99)
    expect(sum).toBeLessThan(101)
  })
})

describe('yearChunks', () => {
  it('splits a multi-year backfill into ≤365-day windows with no gaps', () => {
    const chunks = yearChunks('2021-09-01', '2026-08-26')
    expect(chunks.length).toBe(5)
    expect(chunks[0]).toEqual({ start: '2021-09-01', end: '2022-08-31' })
    expect(chunks[chunks.length - 1].end).toBe('2026-08-26')
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = new Date(`${chunks[i - 1].end}T00:00:00Z`)
      prevEnd.setUTCDate(prevEnd.getUTCDate() + 1)
      expect(chunks[i].start).toBe(prevEnd.toISOString().slice(0, 10))
    }
  })

  it('a short incremental window is a single chunk', () => {
    expect(yearChunks('2026-08-19', '2026-08-26')).toEqual([
      { start: '2026-08-19', end: '2026-08-26' },
    ])
  })
})

function stubSpotifyApis(options: { loginRequired?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('accounts.spotify.com/oauth2/v2/auth')) {
        if (options.loginRequired) {
          return new Response('{"error": "login_required"}')
        }
        const state = new URL(url).searchParams.get('state')
        return new Response(
          `<script>const authorizationResponse = {type: "authorization_response", response: {code: "AUTH_CODE", state: "${state}"}};</script>`
        )
      }
      if (url.includes('accounts.spotify.com/api/token')) {
        expect(String(init?.body)).toContain('code=AUTH_CODE')
        return new Response(JSON.stringify({ access_token: 'BEARER', expires_in: 3600 }))
      }
      if (url.includes('/detailedStreams')) {
        return new Response(
          JSON.stringify({
            detailedStreams: [{ date: '2026-08-25', starts: 175, streams: 123 }],
          })
        )
      }
      if (url.includes('/metadata')) {
        return new Response(
          JSON.stringify({ totalEpisodes: 254, streams: 57592, followers: 3189 })
        )
      }
      if (url.includes('/aggregate')) {
        return new Response(JSON.stringify(AGGREGATE_FIXTURE))
      }
      throw new Error(`unexpected url: ${url}`)
    })
  )
}

describe('spotifyAdapter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    process.env.SPOTIFY_SP_DC = 'dc'
    process.env.SPOTIFY_SP_KEY = 'key'
    mockReadMediakit.mockResolvedValue({
      series: { spotifyDaily: [{ date: '2026-08-20', starts: 100, streams: 80 }] },
    })
  })

  it('collects raw daily series (merged), source totals and demographics', async () => {
    stubSpotifyApis()
    const writes = await spotifyAdapter.collect()

    expect(writes).toContainEqual({
      section: 'series',
      partial: {
        spotifyDaily: [
          { date: '2026-08-20', starts: 100, streams: 80 },
          { date: '2026-08-25', starts: 175, streams: 123 },
        ],
      },
    })
    expect(writes).toContainEqual({
      section: 'stats',
      partial: { viewsSpotifyStreams: 57592 },
    })
    const audience = writes.find((w) => w.section === 'audience')?.partial as Record<
      string,
      unknown
    >
    expect(audience.followers).toEqual({ spotify: 3189 })
    expect(audience.gender).toEqual({ male: 85.5, female: 12.1, notSpecified: 2.4 })
  })

  it('expired cookies fail with the actionable renewal message', async () => {
    stubSpotifyApis({ loginRequired: true })
    await expect(spotifyAdapter.collect()).rejects.toThrow(SpotifyCredentialsExpired)
    await expect(spotifyAdapter.collect()).rejects.toThrow(/sp_dc/)
  })

  it('missing env fails with a clear config error', async () => {
    delete process.env.SPOTIFY_SP_DC
    await expect(spotifyAdapter.collect()).rejects.toThrow(/SPOTIFY_SP_DC/)
  })
})
