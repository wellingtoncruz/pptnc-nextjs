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

vi.mock('@/lib/firebase/tokens', () => ({
  getUserTokensWithExpiry: vi.fn(),
  refreshUserToken: vi.fn(),
  TokenRefreshError: class TokenRefreshError extends Error {
    status?: number
    constructor(message: string, status?: number) {
      super(message)
      this.name = 'TokenRefreshError'
      this.status = status
    }
  },
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast-id',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Store mock function to control per-test
let mockCheckVideoEligibility: ReturnType<typeof vi.fn>

// Mock YouTube client - use class to properly construct instances
vi.mock('@/lib/youtube', () => {
  class YouTubeAPIError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status?: number
    ) {
      super(message)
      this.name = 'YouTubeAPIError'
    }
  }

  return {
    YouTubeClient: class MockYouTubeClient {
      constructor(_accessToken: string) {}
      checkVideoEligibility(...args: unknown[]) {
        return mockCheckVideoEligibility(...args)
      }
    },
    YouTubeAPIError,
  }
})

import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { getUserTokensWithExpiry, refreshUserToken, TokenRefreshError } from '@/lib/firebase/tokens'
import { YouTubeAPIError } from '@/lib/youtube'

const mockAuth = vi.mocked(auth)
const mockGetVideoAdmin = vi.mocked(getVideoAdmin)
const mockUpdateVideoAdmin = vi.mocked(updateVideoAdmin)
const mockGetUserTokensWithExpiry = vi.mocked(getUserTokensWithExpiry)
const mockRefreshUserToken = vi.mocked(refreshUserToken)

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
    mockCheckVideoEligibility = vi.fn()
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })

    it('returns 401 when session has error', async () => {
      mockAuth.mockResolvedValue({ error: 'some error' } as never)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(401)
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

  describe('Token management', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        status: 'sent',
      } as never)
    })

    it('returns 401 when no tokens found', async () => {
      mockGetUserTokensWithExpiry.mockResolvedValue(null)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('NO_TOKENS')
    })

    it('returns 401 when token expired and no refresh token', async () => {
      mockGetUserTokensWithExpiry.mockResolvedValue({
        accessToken: 'expired-token',
        needsRefresh: true,
      } as never)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })

    it('refreshes token when expired and refresh token available', async () => {
      mockGetUserTokensWithExpiry.mockResolvedValue({
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        needsRefresh: true,
      } as never)
      mockRefreshUserToken.mockResolvedValue({
        accessToken: 'new-token',
        refreshToken: 'refresh-token',
        needsRefresh: false,
      } as never)

      mockCheckVideoEligibility.mockResolvedValue({
        privacyStatus: 'unlisted',
        eligible: true,
      })
      mockUpdateVideoAdmin.mockResolvedValue(undefined)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(200)
      expect(mockRefreshUserToken).toHaveBeenCalledWith('user-123', 'refresh-token')
    })

    it('returns 401 when token refresh fails', async () => {
      mockGetUserTokensWithExpiry.mockResolvedValue({
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        needsRefresh: true,
      } as never)
      mockRefreshUserToken.mockRejectedValue(new TokenRefreshError('Refresh failed', 401))

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('TOKEN_REFRESH_FAILED')
    })
  })

  describe('YouTube eligibility check', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        status: 'sent',
      } as never)
      mockGetUserTokensWithExpiry.mockResolvedValue({
        accessToken: 'valid-token',
        needsRefresh: false,
      } as never)
    })

    it('reopens video when privacyStatus is unlisted', async () => {
      mockCheckVideoEligibility.mockResolvedValue({
        privacyStatus: 'unlisted',
        eligible: true,
      })
      mockUpdateVideoAdmin.mockResolvedValue(undefined)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.videoId).toBe('test-video')
      expect(json.data.status).toBe('draft')
    })

    it('reopens video when privacyStatus is private without publishAt', async () => {
      mockCheckVideoEligibility.mockResolvedValue({
        privacyStatus: 'private',
        eligible: true,
      })
      mockUpdateVideoAdmin.mockResolvedValue(undefined)

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.status).toBe('draft')
    })

    it('updates Firestore with status, youtubePrivacyStatus, and visibilityUpdatedAt', async () => {
      mockCheckVideoEligibility.mockResolvedValue({
        privacyStatus: 'unlisted',
        eligible: true,
      })
      mockUpdateVideoAdmin.mockResolvedValue(undefined)

      await POST(createMockRequest(), createContext('test-video'))

      expect(mockUpdateVideoAdmin).toHaveBeenCalledWith(
        'test-podcast-id',
        'test-video',
        expect.objectContaining({
          status: 'draft',
          youtubePrivacyStatus: 'unlisted',
        })
      )

      // Verify visibilityUpdatedAt is passed (Timestamp.now())
      const updateCall = mockUpdateVideoAdmin.mock.calls[0]
      expect(updateCall[2]).toHaveProperty('visibilityUpdatedAt')
    })

    it('blocks reopen when privacyStatus is public', async () => {
      mockCheckVideoEligibility.mockResolvedValue({
        privacyStatus: 'public',
        eligible: false,
      })

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(409)
      const json = await response.json()
      expect(json.error.code).toBe('VIDEO_NOT_ELIGIBLE')
      expect(json.error.message).toContain('status adequado')
    })

    it('blocks reopen when video is scheduled (private with publishAt)', async () => {
      mockCheckVideoEligibility.mockResolvedValue({
        privacyStatus: 'private',
        publishAt: '2026-03-01T10:00:00Z',
        eligible: false,
      })

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(409)
      const json = await response.json()
      expect(json.error.code).toBe('VIDEO_NOT_ELIGIBLE')
    })

    it('does not update Firestore when video is not eligible', async () => {
      mockCheckVideoEligibility.mockResolvedValue({
        privacyStatus: 'public',
        eligible: false,
      })

      await POST(createMockRequest(), createContext('test-video'))

      expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
    })
  })

  describe('YouTube API errors', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        status: 'sent',
      } as never)
      mockGetUserTokensWithExpiry.mockResolvedValue({
        accessToken: 'valid-token',
        needsRefresh: false,
      } as never)
    })

    it('returns YouTube error code on API error', async () => {
      mockCheckVideoEligibility.mockRejectedValue(
        new YouTubeAPIError('YOUTUBE_QUOTA', 'Quota exceeded', 429)
      )

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(429)
      const json = await response.json()
      expect(json.error.code).toBe('YOUTUBE_QUOTA')
    })

    it('returns 500 on unexpected error', async () => {
      mockCheckVideoEligibility.mockRejectedValue(
        new Error('Network error')
      )

      const response = await POST(createMockRequest(), createContext('test-video'))

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
