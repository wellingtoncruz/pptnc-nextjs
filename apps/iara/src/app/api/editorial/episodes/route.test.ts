/**
 * Unit tests for GET /api/editorial/episodes route handler.
 *
 * Tests episode listing for the editorial section grid.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast',
}))

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { GET } from './route'
import { auth } from '@/lib/auth'
import { getAdminDb } from '@/lib/firebase/admin'

const mockAuth = vi.mocked(auth)
const mockGetAdminDb = vi.mocked(getAdminDb)

// Helper to create a mock GET request
function createRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/editorial/episodes')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url.toString(), { method: 'GET' })
}

// Helper to create mock Firestore snapshot
function createMockSnapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({
      id: d.id,
      data: () => d.data,
    })),
  }
}

// Mock Firestore chain
function setupFirestoreMock(snapshot: ReturnType<typeof createMockSnapshot>) {
  const selectMock = vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue(snapshot) })
  const whereMock = vi.fn().mockReturnValue({ select: selectMock })
  const collectionMock = vi.fn().mockReturnValue({ where: whereMock })
  const docMock = vi.fn().mockReturnValue({ collection: collectionMock })

  mockGetAdminDb.mockReturnValue({
    collection: vi.fn().mockReturnValue({ doc: docMock }),
  } as any)

  return { whereMock, selectMock }
}

const mockEpisodes = [
  {
    id: 'ep-1',
    data: {
      title: 'Episode Alpha',
      description: 'First episode description',
      status: 'sent',
      storageThumbnailUrl: 'data:image/jpeg;base64,thumb1',
      publishedAt: '2026-02-07T10:00:00Z',
    },
  },
  {
    id: 'ep-2',
    data: {
      title: 'Episode Beta',
      description: 'Second episode',
      status: 'draft',
      thumbnails: { high: { url: 'https://img.youtube.com/vi/ep-2/hqdefault.jpg' } },
      publishedAt: '2026-02-06T10:00:00Z',
    },
  },
  {
    id: 'ep-3',
    data: {
      title: 'Episode Gamma',
      status: 'ready',
      publishedAt: '2026-02-05T10:00:00Z',
    },
  },
]

describe('GET /api/editorial/episodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await GET(createRequest() as any)

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })

    it('returns 401 when session has error', async () => {
      mockAuth.mockResolvedValue({ error: 'RefreshAccessTokenError' } as any)

      const response = await GET(createRequest() as any)

      expect(response.status).toBe(401)
    })
  })

  describe('Episode listing', () => {
    it('returns episodes sorted by publishedAt desc', async () => {
      setupFirestoreMock(createMockSnapshot(mockEpisodes))

      const response = await GET(createRequest() as any)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data).toHaveLength(3)
      expect(json.data[0].id).toBe('ep-1') // Most recent
      expect(json.data[1].id).toBe('ep-2')
      expect(json.data[2].id).toBe('ep-3')
    })

    it('returns empty array when no episodes exist', async () => {
      setupFirestoreMock(createMockSnapshot([]))

      const response = await GET(createRequest() as any)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data).toEqual([])
    })

    it('limits results to 16 by default', async () => {
      const manyEpisodes = Array.from({ length: 20 }, (_, i) => ({
        id: `ep-${i}`,
        data: {
          title: `Episode ${i}`,
          status: 'sent',
          publishedAt: `2026-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        },
      }))
      setupFirestoreMock(createMockSnapshot(manyEpisodes))

      const response = await GET(createRequest() as any)

      const json = await response.json()
      expect(json.data).toHaveLength(16)
    })

    it('respects custom limit param', async () => {
      const manyEpisodes = Array.from({ length: 5 }, (_, i) => ({
        id: `ep-${i}`,
        data: {
          title: `Episode ${i}`,
          status: 'sent',
          publishedAt: `2026-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        },
      }))
      setupFirestoreMock(createMockSnapshot(manyEpisodes))

      const response = await GET(createRequest({ limit: '3' }) as any)

      const json = await response.json()
      expect(json.data).toHaveLength(3)
    })

    it('returns correct episode fields', async () => {
      setupFirestoreMock(createMockSnapshot([mockEpisodes[0]]))

      const response = await GET(createRequest() as any)

      const json = await response.json()
      const ep = json.data[0]
      expect(ep.id).toBe('ep-1')
      expect(ep.title).toBe('Episode Alpha')
      expect(ep.description).toBe('First episode description')
      expect(ep.status).toBe('sent')
      expect(ep.thumbnailUrl).toBe('data:image/jpeg;base64,thumb1')
      expect(ep.publishedAt).toBe('2026-02-07T10:00:00.000Z')
    })

    it('falls back to YouTube thumbnail URL', async () => {
      setupFirestoreMock(createMockSnapshot([mockEpisodes[1]]))

      const response = await GET(createRequest() as any)

      const json = await response.json()
      expect(json.data[0].thumbnailUrl).toBe('https://img.youtube.com/vi/ep-2/hqdefault.jpg')
    })

    it('handles episodes without description', async () => {
      setupFirestoreMock(createMockSnapshot([mockEpisodes[2]]))

      const response = await GET(createRequest() as any)

      const json = await response.json()
      expect(json.data[0].description).toBeUndefined()
    })
  })

  describe('Search filtering', () => {
    it('filters episodes by title case-insensitive', async () => {
      setupFirestoreMock(createMockSnapshot(mockEpisodes))

      const response = await GET(createRequest({ search: 'beta' }) as any)

      const json = await response.json()
      expect(json.data).toHaveLength(1)
      expect(json.data[0].title).toBe('Episode Beta')
    })

    it('returns all matching episodes without limit when searching', async () => {
      const manyEpisodes = Array.from({ length: 15 }, (_, i) => ({
        id: `ep-${i}`,
        data: {
          title: `Episode Test ${i}`,
          status: 'sent',
          publishedAt: `2026-02-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        },
      }))
      setupFirestoreMock(createMockSnapshot(manyEpisodes))

      const response = await GET(createRequest({ search: 'Test' }) as any)

      const json = await response.json()
      // All 15 match "Test", no limit applied during search
      expect(json.data).toHaveLength(15)
    })

    it('returns empty array when search has no matches', async () => {
      setupFirestoreMock(createMockSnapshot(mockEpisodes))

      const response = await GET(createRequest({ search: 'nonexistent' }) as any)

      const json = await response.json()
      expect(json.data).toEqual([])
    })
  })

  describe('Error handling', () => {
    it('returns 500 on Firestore error', async () => {
      const selectMock = vi.fn().mockReturnValue({
        get: vi.fn().mockRejectedValue(new Error('Firestore connection error')),
      })
      const whereMock = vi.fn().mockReturnValue({ select: selectMock })
      const collectionMock = vi.fn().mockReturnValue({ where: whereMock })
      const docMock = vi.fn().mockReturnValue({ collection: collectionMock })

      mockGetAdminDb.mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: docMock }),
      } as any)

      const response = await GET(createRequest() as any)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('Firestore query', () => {
    it('queries with videoType episode filter', async () => {
      const { whereMock, selectMock } = setupFirestoreMock(createMockSnapshot([]))

      await GET(createRequest() as any)

      expect(whereMock).toHaveBeenCalledWith('videoType', '==', 'episode')
      expect(selectMock).toHaveBeenCalledWith(
        'title', 'description', 'status', 'thumbnails', 'storageThumbnailUrl', 'publishedAt'
      )
    })
  })
})
