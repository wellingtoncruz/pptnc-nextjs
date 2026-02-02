import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from './route'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/firebase/videos-admin', () => ({
  getEpisodesWithContext: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast-id',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { getEpisodesWithContext } from '@/lib/firebase/videos-admin'

const mockAuth = vi.mocked(auth)
const mockGetEpisodesWithContext = vi.mocked(getEpisodesWithContext)

// Helper to create mock request with optional query params
function createMockRequest(queryParams?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/videos/episodes')
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }
  return new NextRequest(url, {
    method: 'GET',
  })
}

describe('GET /api/videos/episodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const request = createMockRequest()
      const response = await GET(request)

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })

    it('returns 401 when session has error', async () => {
      mockAuth.mockResolvedValue({ error: 'some error' } as never)

      const request = createMockRequest()
      const response = await GET(request)

      expect(response.status).toBe(401)
    })

    it('proceeds when authenticated', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockGetEpisodesWithContext.mockResolvedValue([])

      const request = createMockRequest()
      const response = await GET(request)

      expect(response.status).toBe(200)
    })
  })

  describe('Success cases', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns empty array when no episodes exist', async () => {
      mockGetEpisodesWithContext.mockResolvedValue([])

      const request = createMockRequest()
      const response = await GET(request)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data).toEqual([])
    })

    it('returns episodes with context', async () => {
      const mockEpisodes = [
        {
          id: 'ep-1',
          title: 'Episode 1',
          theme: 'Technology',
          guests: [{ name: 'John Doe' }],
          duration: 3600,
        },
        {
          id: 'ep-2',
          title: 'Episode 2',
          theme: 'Science',
          guests: [],
          duration: 1800,
        },
      ]
      mockGetEpisodesWithContext.mockResolvedValue(mockEpisodes as never)

      const request = createMockRequest()
      const response = await GET(request)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data).toHaveLength(2)
      expect(json.data[0].id).toBe('ep-1')
      expect(json.data[1].id).toBe('ep-2')
    })

    it('calls getEpisodesWithContext with correct podcast ID and default limit', async () => {
      mockGetEpisodesWithContext.mockResolvedValue([])

      const request = createMockRequest()
      await GET(request)

      // Default limit is 5
      expect(mockGetEpisodesWithContext).toHaveBeenCalledWith('test-podcast-id', 5)
    })

    it('uses custom limit when provided', async () => {
      mockGetEpisodesWithContext.mockResolvedValue([])

      const request = createMockRequest({ limit: '10' })
      await GET(request)

      expect(mockGetEpisodesWithContext).toHaveBeenCalledWith('test-podcast-id', 10)
    })

    it('caps limit at maximum (50)', async () => {
      mockGetEpisodesWithContext.mockResolvedValue([])

      const request = createMockRequest({ limit: '100' })
      await GET(request)

      expect(mockGetEpisodesWithContext).toHaveBeenCalledWith('test-podcast-id', 50)
    })

    it('uses default limit for invalid limit values', async () => {
      mockGetEpisodesWithContext.mockResolvedValue([])

      const request = createMockRequest({ limit: 'invalid' })
      await GET(request)

      expect(mockGetEpisodesWithContext).toHaveBeenCalledWith('test-podcast-id', 5)
    })
  })

  describe('Search functionality', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 400 when search is less than 5 characters', async () => {
      const request = createMockRequest({ search: 'abc' })
      const response = await GET(request)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_SEARCH')
      expect(json.error.message).toContain('5 caracteres')
    })

    it('accepts search with 5+ characters', async () => {
      mockGetEpisodesWithContext.mockResolvedValue([
        { id: 'ep-1', title: 'Technology Talk' },
        { id: 'ep-2', title: 'Science Show' },
      ] as never)

      const request = createMockRequest({ search: 'techn' })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const json = await response.json()
      // Should filter to only matching episode
      expect(json.data).toHaveLength(1)
      expect(json.data[0].title).toBe('Technology Talk')
    })

    it('fetches more results when searching (50 max)', async () => {
      mockGetEpisodesWithContext.mockResolvedValue([])

      const request = createMockRequest({ search: 'testing' })
      await GET(request)

      // When searching, fetch up to 50 to allow for client-side filtering
      expect(mockGetEpisodesWithContext).toHaveBeenCalledWith('test-podcast-id', 50)
    })

    it('returns max 10 search results (AC2: deve mostrar até 10 resultados)', async () => {
      // AC2: Search results are capped at 10 to avoid overwhelming the UI
      // Create 15 matching episodes to test the limit
      const manyEpisodes = Array.from({ length: 15 }, (_, i) => ({
        id: `ep-${i}`,
        title: `Testing Episode ${i}`,
      }))
      mockGetEpisodesWithContext.mockResolvedValue(manyEpisodes as never)

      const request = createMockRequest({ search: 'testing' })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data).toHaveLength(10)
    })

    it('search is case-insensitive', async () => {
      mockGetEpisodesWithContext.mockResolvedValue([
        { id: 'ep-1', title: 'UPPERCASE TITLE' },
        { id: 'ep-2', title: 'lowercase title' },
        { id: 'ep-3', title: 'Other Video' },
      ] as never)

      const request = createMockRequest({ search: 'TITLE' })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data).toHaveLength(2)
    })

    it('returns empty array when search has no matches', async () => {
      mockGetEpisodesWithContext.mockResolvedValue([
        { id: 'ep-1', title: 'Episode 1' },
        { id: 'ep-2', title: 'Episode 2' },
      ] as never)

      const request = createMockRequest({ search: 'nonexistent' })
      const response = await GET(request)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data).toEqual([])
    })
  })

  describe('Error handling', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 500 on internal error', async () => {
      mockGetEpisodesWithContext.mockRejectedValue(new Error('Database error'))

      const request = createMockRequest()
      const response = await GET(request)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
