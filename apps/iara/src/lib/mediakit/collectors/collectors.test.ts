import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── shared mocks ─────────────────────────────────────────────────────────

const mockWriteSection = vi.fn()
vi.mock('@/lib/firebase/mediakit-admin', () => ({
  writeMediakitSection: (...args: unknown[]) => mockWriteSection(...args),
  readMediakit: () => mockReadMediakit(),
}))
const mockReadMediakit = vi.fn()

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

const mockCount = vi.fn()
const mockWhere = vi.fn(() => ({ count: () => ({ get: mockCount }) }))
vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({ where: mockWhere, get: mockUsersGet }),
        get: mockPodcastGet,
      }),
    }),
  }),
}))
const mockUsersGet = vi.fn()
const mockPodcastGet = vi.fn()

vi.mock('@/lib/firebase/config', () => ({ PODCAST_ID: 'test-podcast' }))

const mockGetUserTokens = vi.fn()
vi.mock('@/lib/firebase/tokens', () => ({
  getUserTokens: (id: string) => mockGetUserTokens(id),
  saveUserTokens: vi.fn(),
}))

vi.mock('@/lib/auth/refresh-token', () => ({
  isTokenExpired: () => false,
  refreshAccessToken: vi.fn(),
}))

import { iaraCountsAdapter } from './iara-counts'
import { runCollectors, type CollectorAdapter } from './runner'
import { incrementalStart, mergeByDate } from './series-utils'
import { youtubeAdapter } from './youtube'

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

// ── runner ───────────────────────────────────────────────────────────────

describe('runCollectors', () => {
  const okAdapter: CollectorAdapter = {
    name: 'ok-adapter',
    collect: async () => [{ section: 'stats', partial: { episodes: 10 } }],
  }
  const brokenAdapter: CollectorAdapter = {
    name: 'broken-adapter',
    collect: async () => {
      throw new Error('source exploded')
    },
  }

  it('a failing adapter never stops the others (isolation)', async () => {
    const report = await runCollectors([brokenAdapter, okAdapter])
    expect(report.ok).toBe(false)
    expect(report.adapters).toEqual([
      { name: 'broken-adapter', ok: false, fields: [], error: 'source exploded' },
      { name: 'ok-adapter', ok: true, fields: ['stats.episodes'] },
    ])
    expect(mockWriteSection).toHaveBeenCalledWith('stats', { episodes: 10 }, 'ok-adapter')
  })

  it('writes carry the adapter name as source', async () => {
    await runCollectors([okAdapter])
    expect(mockWriteSection).toHaveBeenCalledTimes(1)
    expect(mockWriteSection.mock.calls[0][2]).toBe('ok-adapter')
  })
})

// ── iara-counts ──────────────────────────────────────────────────────────

describe('iaraCountsAdapter', () => {
  beforeEach(() => {
    delete process.env.MEDIAKIT_EPISODE_OFFSET
    delete process.env.MEDIAKIT_CUTS_PER_EPISODE
    delete process.env.MEDIAKIT_SHORTS_PER_EPISODE
  })

  it('decisão A1: episódios = total − offset 8; cortes ×5 e shorts ×8 derivados', async () => {
    mockWhere.mockImplementation((() => ({
      count: () => ({ get: async () => ({ data: () => ({ count: 248 }) }) }),
    })) as never)

    const writes = await iaraCountsAdapter.collect()
    expect(writes).toEqual([
      { section: 'stats', partial: { episodes: 240, cuts: 1200, shorts: 1920 } },
    ])
  })

  it('offset e razões são env-overridable (offset zera após limpeza do lixo)', async () => {
    process.env.MEDIAKIT_EPISODE_OFFSET = '0'
    mockWhere.mockImplementation((() => ({
      count: () => ({ get: async () => ({ data: () => ({ count: 248 }) }) }),
    })) as never)

    const writes = await iaraCountsAdapter.collect()
    expect(writes[0].partial).toEqual({ episodes: 248, cuts: 1240, shorts: 1984 })
  })
})

// ── youtube: pure helpers ────────────────────────────────────────────────

describe('series helpers (shared youtube/spotify)', () => {
  it('mergeByDate: fresh points overwrite by date, result sorted', () => {
    const merged = mergeByDate(
      [
        { date: '2026-08-01', minutes: 100 },
        { date: '2026-08-02', minutes: 200 },
      ],
      [
        { date: '2026-08-02', minutes: 250 },
        { date: '2026-08-03', minutes: 50 },
      ]
    )
    expect(merged).toEqual([
      { date: '2026-08-01', minutes: 100 },
      { date: '2026-08-02', minutes: 250 },
      { date: '2026-08-03', minutes: 50 },
    ])
  })

  it('incrementalStart: backfill from launch when empty, overlap of 7 days after', () => {
    expect(incrementalStart([])).toBe('2021-09-01')
    expect(incrementalStart([{ date: '2026-08-20', minutes: 1 }])).toBe('2026-08-13')
  })
})

// ── youtube: adapter flow ────────────────────────────────────────────────

function stubYoutubeApis(analyticsStatus = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('googleapis.com/youtube/v3/channels')) {
        return new Response(
          JSON.stringify({
            items: [{ statistics: { viewCount: '2650000', subscriberCount: '34076' } }],
          })
        )
      }
      if (analyticsStatus !== 200) {
        return new Response('insufficient scopes', { status: analyticsStatus })
      }
      if (url.includes('dimensions=day')) {
        return new Response(
          JSON.stringify({ rows: [['2026-08-25', 3480], ['2026-08-26', 1200]] })
        )
      }
      return new Response(JSON.stringify({ rows: [[10_320_000]] }))
    })
  )
}

describe('youtubeAdapter', () => {
  beforeEach(() => {
    mockPodcastGet.mockResolvedValue({ data: () => ({ channelId: 'UCtest' }) })
    process.env.MEDIAKIT_YOUTUBE_USER_ID = 'user-1'
    mockGetUserTokens.mockResolvedValue({ accessToken: 'tok', refreshToken: 'ref', expiresAt: 9e9 })
    mockReadMediakit.mockResolvedValue({ series: { youtubeWatchDaily: [], spotifyDaily: [] } })
  })

  it('collects scalars from the source and the RAW daily series (backfill mode)', async () => {
    stubYoutubeApis()
    const writes = await youtubeAdapter.collect()
    expect(writes).toContainEqual({
      section: 'stats',
      partial: { viewsYoutube: 2_650_000, watchHours: 172_000 },
    })
    expect(writes).toContainEqual({
      section: 'audience',
      partial: { youtubeSubscribers: 34_076 },
    })
    expect(writes).toContainEqual({
      section: 'series',
      partial: {
        youtubeWatchDaily: [
          { date: '2026-08-25', minutes: 3480 },
          { date: '2026-08-26', minutes: 1200 },
        ],
      },
    })
  })

  it('missing analytics scope fails LOUD with the API status (runner isolates it)', async () => {
    stubYoutubeApis(403)
    await expect(youtubeAdapter.collect()).rejects.toThrow(/403/)
  })
})
