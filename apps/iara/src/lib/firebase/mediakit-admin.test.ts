import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock setup (pattern: social-admin.test.ts) ---

const mockSectionSet = vi.fn()
const mockCollectionGet = vi.fn()
const mockSectionDoc = vi.fn(() => ({ set: mockSectionSet }))
const mockMediakitCollection = vi.fn(() => ({
  get: mockCollectionGet,
  doc: mockSectionDoc,
}))
const mockPodcastDoc = vi.fn(() => ({ collection: mockMediakitCollection }))
const mockCollection = vi.fn(() => ({ doc: mockPodcastDoc }))

vi.mock('./admin', () => ({
  getAdminDb: vi.fn(() => ({ collection: mockCollection })),
}))

vi.mock('./config', () => ({
  PODCAST_ID: 'test-podcast',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => 'MOCK_SERVER_TIMESTAMP',
  },
}))

import { log } from '@/lib/logger'
import {
  MEDIAKIT_SEED_AUDIENCE,
  MEDIAKIT_SEED_SERIES,
  MEDIAKIT_SEED_STATS,
} from '@/lib/mediakit/seed-values'

import { readMediakit, writeMediakitSection } from './mediakit-admin'

const mockTimestamp = { toDate: () => new Date('2026-08-25T00:00:00Z') }

function mockDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readMediakit', () => {
  it('returns all three sections when the docs are valid', async () => {
    mockCollectionGet.mockResolvedValue({
      docs: [
        mockDoc('stats', { ...MEDIAKIT_SEED_STATS, updatedAt: mockTimestamp }),
        mockDoc('audience', MEDIAKIT_SEED_AUDIENCE),
        mockDoc('series', MEDIAKIT_SEED_SERIES),
      ],
    })

    const data = await readMediakit()
    expect(data.stats?.episodes).toBe(234)
    expect(data.audience?.followers.spotify).toBe(3325)
    expect(data.series?.spotifyDaily).toEqual([])
  })

  it('returns null + WARN for a missing section', async () => {
    mockCollectionGet.mockResolvedValue({
      docs: [mockDoc('stats', MEDIAKIT_SEED_STATS)],
    })

    const data = await readMediakit()
    expect(data.stats).not.toBeNull()
    expect(data.audience).toBeNull()
    expect(data.series).toBeNull()
    expect(log).toHaveBeenCalledWith('WARN', 'Mediakit section missing', { section: 'audience' })
  })

  it('returns null + WARN for an invalid section (never throws)', async () => {
    mockCollectionGet.mockResolvedValue({
      docs: [
        mockDoc('stats', { ...MEDIAKIT_SEED_STATS, episodes: -5 }),
        mockDoc('audience', MEDIAKIT_SEED_AUDIENCE),
        mockDoc('series', MEDIAKIT_SEED_SERIES),
      ],
    })

    const data = await readMediakit()
    expect(data.stats).toBeNull()
    expect(data.audience).not.toBeNull()
    expect(log).toHaveBeenCalledWith(
      'WARN',
      'Invalid mediakit section skipped',
      expect.objectContaining({ section: 'stats' })
    )
  })
})

describe('writeMediakitSection', () => {
  it('merge-writes the validated partial with updatedAt and per-source metadata', async () => {
    await writeMediakitSection('stats', { episodes: 240, cuts: 1200 }, 'iara-counts')

    expect(mockSectionDoc).toHaveBeenCalledWith('stats')
    expect(mockSectionSet).toHaveBeenCalledWith(
      {
        episodes: 240,
        cuts: 1200,
        updatedAt: 'MOCK_SERVER_TIMESTAMP',
        sources: {
          'iara-counts': { updatedAt: 'MOCK_SERVER_TIMESTAMP', fields: ['episodes', 'cuts'] },
        },
      },
      { merge: true }
    )
  })

  it('a followers subset merges without carrying sibling networks', async () => {
    await writeMediakitSection('audience', { followers: { tiktok: 3300 } }, 'brightdata-socials')

    const [payload, options] = mockSectionSet.mock.calls[0]
    expect(payload.followers).toEqual({ tiktok: 3300 })
    expect(options).toEqual({ merge: true })
  })

  it('strips unknown keys before writing (contract is the schema, not the caller)', async () => {
    await writeMediakitSection(
      'stats',
      { watchHours: 175_000, hacked: true } as never,
      'youtube'
    )

    const [payload] = mockSectionSet.mock.calls[0]
    expect(payload.watchHours).toBe(175_000)
    expect(payload).not.toHaveProperty('hacked')
  })

  it('skips the write entirely when no valid field remains', async () => {
    await writeMediakitSection('stats', { bogus: 1 } as never, 'youtube')

    expect(mockSectionSet).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('WARN', 'Mediakit write with no valid fields — skipped', {
      section: 'stats',
      source: 'youtube',
    })
  })

  it('rejects an invalid partial loudly (adapter bug must not land half-data)', async () => {
    await expect(
      writeMediakitSection(
        'series',
        { spotifyDaily: [{ date: 'nope', starts: 1, streams: 1 }] },
        'spotify'
      )
    ).rejects.toThrow()
    expect(mockSectionSet).not.toHaveBeenCalled()
  })
})
