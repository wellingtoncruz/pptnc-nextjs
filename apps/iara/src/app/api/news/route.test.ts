import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast',
}))

vi.mock('@/lib/firebase/news-admin', () => ({
  listNews: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { GET } from './route'
import { auth } from '@/lib/auth'
import { listNews } from '@/lib/firebase/news-admin'

const mockAuth = vi.mocked(auth)
const mockListNews = vi.mocked(listNews)

function createRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/news')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url.toString(), { method: 'GET' })
}

describe('GET /api/news', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await GET(createRequest() as never)

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })

    it('returns 401 when session has error', async () => {
      mockAuth.mockResolvedValue({ error: 'expired' } as never)

      const response = await GET(createRequest() as never)

      expect(response.status).toBe(401)
    })
  })

  describe('Query params', () => {
    it('uses default limit of 16', async () => {
      mockListNews.mockResolvedValue({ items: [], nextCursor: null })

      await GET(createRequest() as never)

      expect(mockListNews).toHaveBeenCalledWith('test-podcast', {
        cursor: undefined,
        limit: 16,
      })
    })

    it('respects custom limit', async () => {
      mockListNews.mockResolvedValue({ items: [], nextCursor: null })

      await GET(createRequest({ limit: '10' }) as never)

      expect(mockListNews).toHaveBeenCalledWith('test-podcast', {
        cursor: undefined,
        limit: 10,
      })
    })

    it('caps limit at 50', async () => {
      mockListNews.mockResolvedValue({ items: [], nextCursor: null })

      await GET(createRequest({ limit: '100' }) as never)

      expect(mockListNews).toHaveBeenCalledWith('test-podcast', {
        cursor: undefined,
        limit: 50,
      })
    })

    it('passes cursor when provided', async () => {
      mockListNews.mockResolvedValue({ items: [], nextCursor: null })

      await GET(createRequest({ cursor: '2026-02-09T00:00:00.000Z' }) as never)

      expect(mockListNews).toHaveBeenCalledWith('test-podcast', {
        cursor: '2026-02-09T00:00:00.000Z',
        limit: 16,
      })
    })
  })

  describe('Success responses', () => {
    it('returns items and nextCursor', async () => {
      const mockItems = [
        { id: 'news-1', titulo: 'Test News' },
      ]
      mockListNews.mockResolvedValue({
        items: mockItems as never,
        nextCursor: '2026-02-08T00:00:00.000Z',
        totalCount: 25,
      })

      const response = await GET(createRequest() as never)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.items).toHaveLength(1)
      expect(json.data.nextCursor).toBe('2026-02-08T00:00:00.000Z')
      expect(json.data.totalCount).toBe(25)
    })

    it('returns null nextCursor when no more pages', async () => {
      mockListNews.mockResolvedValue({ items: [], nextCursor: null, totalCount: 0 })

      const response = await GET(createRequest() as never)

      const json = await response.json()
      expect(json.data.nextCursor).toBeNull()
      expect(json.data.totalCount).toBe(0)
    })
  })

  describe('Error handling', () => {
    it('returns 500 on internal error', async () => {
      mockListNews.mockRejectedValue(new Error('Firestore error'))

      const response = await GET(createRequest() as never)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
