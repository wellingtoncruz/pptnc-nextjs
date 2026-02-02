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
  return new NextRequest('http://localhost/api/videos/test-video/short-title', {
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

describe('PUT /api/videos/[videoId]/short-title', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const request = createMockRequest({ shortTitle: 'Test' })
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })
  })

  describe('Request validation', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 400 for missing shortTitle', async () => {
      const request = createMockRequest({})
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(400)
    })

    it('returns 400 for empty shortTitle', async () => {
      const request = createMockRequest({ shortTitle: '' })
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(400)
    })

    it('returns 400 for shortTitle too long', async () => {
      const request = createMockRequest({ shortTitle: 'A'.repeat(51) })
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(400)
    })
  })

  describe('Video validation', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 404 when video not found', async () => {
      mockGetVideoAdmin.mockResolvedValue(null)

      const request = createMockRequest({ shortTitle: 'Test' })
      const response = await PUT(request, createContext('non-existent'))

      expect(response.status).toBe(404)
      const json = await response.json()
      expect(json.error.code).toBe('NOT_FOUND')
    })

    it('returns 400 when video is not a cut', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        videoType: 'episode',
      } as never)

      const request = createMockRequest({ shortTitle: 'Test' })
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
    })

    it('returns 400 when video is a reel', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        videoType: 'reel',
      } as never)

      const request = createMockRequest({ shortTitle: 'Test' })
      const response = await PUT(request, createContext('test-video'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
    })
  })

  describe('Success cases', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockUpdateVideoAdmin.mockResolvedValue(undefined)
    })

    it('updates short title for cut video', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'cut-video',
        videoType: 'cut',
      } as never)

      const request = createMockRequest({ shortTitle: 'Short Title' })
      const response = await PUT(request, createContext('cut-video'))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.shortTitle).toBe('Short Title')
      expect(json.data.videoId).toBe('cut-video')
    })

    it('calls updateVideoAdmin with correct data', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'cut-video',
        videoType: 'cut',
      } as never)

      const request = createMockRequest({ shortTitle: 'My Short Title' })
      await PUT(request, createContext('cut-video'))

      expect(mockUpdateVideoAdmin).toHaveBeenCalledWith(
        'test-podcast-id',
        'cut-video',
        { shortTitle: 'My Short Title' }
      )
    })

    it('accepts short titles up to 50 characters', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'cut-video',
        videoType: 'cut',
      } as never)

      const shortTitle = 'A'.repeat(50)
      const request = createMockRequest({ shortTitle })
      const response = await PUT(request, createContext('cut-video'))

      expect(response.status).toBe(200)
    })
  })

  describe('Error handling', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 500 on database error', async () => {
      mockGetVideoAdmin.mockRejectedValue(new Error('Database error'))

      const request = createMockRequest({ shortTitle: 'Test' })
      const response = await PUT(request, createContext('cut-video'))

      expect(response.status).toBe(500)
    })
  })
})
