import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { PUT } from './route'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: vi.fn(),
  updateVideoAdmin: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast-id',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'

const mockAuth = vi.mocked(auth)
const mockGetVideoAdmin = vi.mocked(getVideoAdmin)
const mockUpdateVideoAdmin = vi.mocked(updateVideoAdmin)

// Helper to create mock request
function createMockRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/videos/test-video/parent', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Helper to create route context
function createContext(videoId: string) {
  return {
    params: Promise.resolve({ videoId }),
  }
}

describe('PUT /api/videos/[videoId]/parent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const request = createMockRequest({ parentEpisodeId: 'ep-1' })
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })

    it('returns 401 when session has error', async () => {
      mockAuth.mockResolvedValue({ error: 'some error' } as never)

      const request = createMockRequest({ parentEpisodeId: 'ep-1' })
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(401)
    })
  })

  describe('Request validation', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 400 for missing parentEpisodeId', async () => {
      const request = createMockRequest({})
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_BODY')
    })

    it('returns 400 for empty parentEpisodeId', async () => {
      const request = createMockRequest({ parentEpisodeId: '' })
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(400)
    })
  })

  describe('Video validation', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 404 when video does not exist', async () => {
      mockGetVideoAdmin.mockResolvedValue(null)

      const request = createMockRequest({ parentEpisodeId: 'ep-1' })
      const response = await PUT(request, createContext('non-existent'))

      expect(response.status).toBe(404)
      const json = await response.json()
      expect(json.error.code).toBe('NOT_FOUND')
    })

    it('returns 400 when video type is episode', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        videoType: 'episode',
      } as never)

      const request = createMockRequest({ parentEpisodeId: 'ep-1' })
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
    })

    it('returns 400 when video type is undefined (defaults to episode)', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        videoType: undefined,
      } as never)

      const request = createMockRequest({ parentEpisodeId: 'ep-1' })
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
    })
  })

  describe('Parent episode validation', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 404 when parent episode does not exist', async () => {
      mockGetVideoAdmin
        .mockResolvedValueOnce({ id: 'cut-video', videoType: 'cut' } as never)
        .mockResolvedValueOnce(null)

      const request = createMockRequest({ parentEpisodeId: 'non-existent' })
      const response = await PUT(request, createContext('cut-video'))

      expect(response.status).toBe(404)
      const json = await response.json()
      expect(json.error.code).toBe('PARENT_NOT_FOUND')
    })

    it('returns 400 when parent is not an episode', async () => {
      mockGetVideoAdmin
        .mockResolvedValueOnce({ id: 'cut-video', videoType: 'cut' } as never)
        .mockResolvedValueOnce({ id: 'another-cut', videoType: 'cut' } as never)

      const request = createMockRequest({ parentEpisodeId: 'another-cut' })
      const response = await PUT(request, createContext('cut-video'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_PARENT_TYPE')
    })

    it('returns 400 when trying to set self as parent', async () => {
      mockGetVideoAdmin.mockResolvedValueOnce({ id: 'cut-video', videoType: 'cut' } as never)

      const request = createMockRequest({ parentEpisodeId: 'cut-video' })
      const response = await PUT(request, createContext('cut-video'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('SELF_REFERENCE')
    })
  })

  describe('Success cases', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockUpdateVideoAdmin.mockResolvedValue(undefined)
    })

    it('sets parent for cut video and inherits data', async () => {
      const parentEpisode = {
        id: 'ep-1',
        videoType: 'episode',
        guests: [{ name: 'John Doe', role: 'Guest' }],
        theme: 'Technology',
      }

      mockGetVideoAdmin
        .mockResolvedValueOnce({ id: 'cut-video', videoType: 'cut' } as never)
        .mockResolvedValueOnce(parentEpisode as never)

      const request = createMockRequest({ parentEpisodeId: 'ep-1' })
      const response = await PUT(request, createContext('cut-video'))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.parentEpisodeId).toBe('ep-1')
      expect(json.data.guests).toEqual(parentEpisode.guests)
      expect(json.data.theme).toBe('Technology')
    })

    it('sets parent for reel video', async () => {
      const parentEpisode = {
        id: 'ep-1',
        videoType: 'episode',
        guests: [],
        theme: 'Science',
      }

      mockGetVideoAdmin
        .mockResolvedValueOnce({ id: 'reel-video', videoType: 'reel' } as never)
        .mockResolvedValueOnce(parentEpisode as never)

      const request = createMockRequest({ parentEpisodeId: 'ep-1' })
      const response = await PUT(request, createContext('reel-video'))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.parentEpisodeId).toBe('ep-1')
      expect(json.data.theme).toBe('Science')
    })

    it('handles parent with no guests', async () => {
      const parentEpisode = {
        id: 'ep-1',
        videoType: 'episode',
        guests: undefined,
        theme: 'Test',
      }

      mockGetVideoAdmin
        .mockResolvedValueOnce({ id: 'cut-video', videoType: 'cut' } as never)
        .mockResolvedValueOnce(parentEpisode as never)

      const request = createMockRequest({ parentEpisodeId: 'ep-1' })
      const response = await PUT(request, createContext('cut-video'))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.guests).toEqual([])
    })

    it('handles parent with no theme', async () => {
      const parentEpisode = {
        id: 'ep-1',
        videoType: 'episode',
        guests: [],
        theme: undefined,
      }

      mockGetVideoAdmin
        .mockResolvedValueOnce({ id: 'cut-video', videoType: 'cut' } as never)
        .mockResolvedValueOnce(parentEpisode as never)

      const request = createMockRequest({ parentEpisodeId: 'ep-1' })
      const response = await PUT(request, createContext('cut-video'))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.theme).toBe('')
    })

    it('calls updateVideoAdmin with correct data', async () => {
      const parentEpisode = {
        id: 'ep-1',
        videoType: 'episode',
        guests: [{ name: 'Jane' }],
        theme: 'Art',
      }

      mockGetVideoAdmin
        .mockResolvedValueOnce({ id: 'cut-video', videoType: 'cut' } as never)
        .mockResolvedValueOnce(parentEpisode as never)

      const request = createMockRequest({ parentEpisodeId: 'ep-1' })
      await PUT(request, createContext('cut-video'))

      expect(mockUpdateVideoAdmin).toHaveBeenCalledWith(
        'test-podcast-id',
        'cut-video',
        {
          parentEpisodeId: 'ep-1',
          guests: [{ name: 'Jane' }],
          theme: 'Art',
        }
      )
    })
  })

  describe('Error handling', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 500 on internal error', async () => {
      mockGetVideoAdmin.mockRejectedValue(new Error('Database error'))

      const request = createMockRequest({ parentEpisodeId: 'ep-1' })
      const response = await PUT(request, createContext('cut-video'))

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
