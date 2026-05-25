import { describe, it, expect, vi, beforeEach } from 'vitest'

import { POST } from './route'

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
function createMockRequest(): Request {
  return new Request('http://localhost/api/videos/test-video/reopen', {
    method: 'POST',
  })
}

// Helper to create route context
function createContext(videoId: string) {
  return {
    params: Promise.resolve({ videoId }),
  }
}

describe('POST /api/videos/[videoId]/reopen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })

    it('returns 401 when session has no user id', async () => {
      mockAuth.mockResolvedValue({ user: {} } as never)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(401)
    })
  })

  describe('Video validation', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 404 when video does not exist', async () => {
      mockGetVideoAdmin.mockResolvedValue(null)

      const response = await POST(createMockRequest(), createContext('non-existent'))

      expect(response.status).toBe(404)
      const json = await response.json()
      expect(json.error.code).toBe('NOT_FOUND')
    })

    it('returns 400 when video status is not sent', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        status: 'draft',
      } as never)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_STATUS')
    })

    it('returns 400 when video status is new', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        status: 'new',
      } as never)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_STATUS')
    })
  })

  describe('Reopen (editorial-only, no YouTube check)', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        status: 'sent',
      } as never)
    })

    it('reopens a sent video to draft without checking YouTube', async () => {
      mockUpdateVideoAdmin.mockResolvedValue(undefined as never)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.videoId).toBe('test-video')
      expect(json.data.status).toBe('draft')
    })

    it('updates Firestore with status draft only (no YouTube fields)', async () => {
      mockUpdateVideoAdmin.mockResolvedValue(undefined as never)

      await POST(createMockRequest(), createContext('test-video'))

      expect(mockUpdateVideoAdmin).toHaveBeenCalledWith(
        'test-podcast-id',
        'test-video',
        { status: 'draft' }
      )

      // No YouTube-derived fields are written anymore
      const updateCall = mockUpdateVideoAdmin.mock.calls[0]
      expect(updateCall[2]).not.toHaveProperty('youtubePrivacyStatus')
      expect(updateCall[2]).not.toHaveProperty('visibilityUpdatedAt')
    })

    it('returns 500 when Firestore update fails', async () => {
      mockUpdateVideoAdmin.mockRejectedValue(new Error('Firestore down'))

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
