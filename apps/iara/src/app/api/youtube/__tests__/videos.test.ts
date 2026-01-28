import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '../videos/route'

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

// Mock tokens
vi.mock('@/lib/firebase/tokens', () => ({
  getUserTokensWithExpiry: vi.fn(),
  refreshUserToken: vi.fn(),
  TokenRefreshError: class TokenRefreshError extends Error {
    constructor(
      message: string,
      public status?: number
    ) {
      super(message)
      this.name = 'TokenRefreshError'
    }
  },
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Store mock listVideos function to control per-test
let mockListVideos: ReturnType<typeof vi.fn>

// Mock YouTube client - use class to properly construct instances
vi.mock('@/lib/youtube', () => {
  // Define error class inside factory to avoid hoisting issues
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
      listVideos(...args: unknown[]) {
        return mockListVideos(...args)
      }
    },
    YouTubeAPIError,
  }
})

// Import mocks for manipulation
import { auth } from '@/lib/auth'
import { getUserTokensWithExpiry, refreshUserToken, TokenRefreshError } from '@/lib/firebase/tokens'
import { YouTubeAPIError } from '@/lib/youtube'

const mockAuth = vi.mocked(auth)
const mockGetUserTokens = vi.mocked(getUserTokensWithExpiry)
const mockRefreshToken = vi.mocked(refreshUserToken)

describe('GET /api/youtube/videos', () => {
  const createRequest = (params?: Record<string, string>) => {
    const url = new URL('http://localhost:3000/api/youtube/videos')
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
    }
    return { url: url.toString() } as Request
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mockListVideos for each test
    mockListVideos = vi.fn()
  })

  describe('authentication', () => {
    it('returns 401 when no session', async () => {
      mockAuth.mockResolvedValueOnce(null)

      const response = await GET(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTH_EXPIRED')
    })

    it('returns 401 when session has no user id', async () => {
      mockAuth.mockResolvedValueOnce({ user: {} } as never)

      const response = await GET(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTH_EXPIRED')
    })

    it('returns 401 when no tokens found', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user123' } } as never)
      mockGetUserTokens.mockResolvedValueOnce(null)

      const response = await GET(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('NO_TOKENS')
    })
  })

  describe('token refresh', () => {
    it('refreshes token when needsRefresh is true', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user123' } } as never)
      mockGetUserTokens.mockResolvedValueOnce({
        accessToken: 'old-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() - 1000,
        needsRefresh: true,
      })
      mockRefreshToken.mockResolvedValueOnce({
        accessToken: 'new-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        needsRefresh: false,
      })

      mockListVideos.mockResolvedValueOnce({ videos: [], nextPageToken: undefined })

      const response = await GET(createRequest() as never)

      expect(mockRefreshToken).toHaveBeenCalledWith('user123', 'refresh-token')
      expect(response.status).toBe(200)
    })

    it('returns 401 when token refresh fails', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user123' } } as never)
      mockGetUserTokens.mockResolvedValueOnce({
        accessToken: 'old-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() - 1000,
        needsRefresh: true,
      })
      mockRefreshToken.mockRejectedValueOnce(new TokenRefreshError('Refresh failed', 400))

      const response = await GET(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('TOKEN_REFRESH_FAILED')
    })

    it('returns 401 when needsRefresh but no refresh token', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user123' } } as never)
      mockGetUserTokens.mockResolvedValueOnce({
        accessToken: 'old-token',
        refreshToken: undefined,
        expiresAt: Date.now() - 1000,
        needsRefresh: true,
      })

      const response = await GET(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTH_EXPIRED')
    })
  })

  describe('successful requests', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user123' } } as never)
      mockGetUserTokens.mockResolvedValue({
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        needsRefresh: false,
      })
    })

    it('returns videos with default maxResults', async () => {
      const mockVideos = [
        { id: 'vid1', title: 'Video 1', description: '', thumbnail: '', duration: 600, publishedAt: '2024-01-01' },
      ]
      mockListVideos.mockResolvedValueOnce({ videos: mockVideos, nextPageToken: 'next123' })

      const response = await GET(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.videos).toEqual(mockVideos)
      expect(data.data.nextPageToken).toBe('next123')
      expect(mockListVideos).toHaveBeenCalledWith({ maxResults: 50, pageToken: undefined })
    })

    it('respects maxResults query param', async () => {
      mockListVideos.mockResolvedValueOnce({ videos: [], nextPageToken: undefined })

      await GET(createRequest({ maxResults: '25' }) as never)

      expect(mockListVideos).toHaveBeenCalledWith({ maxResults: 25, pageToken: undefined })
    })

    it('caps maxResults at 50', async () => {
      mockListVideos.mockResolvedValueOnce({ videos: [], nextPageToken: undefined })

      await GET(createRequest({ maxResults: '100' }) as never)

      expect(mockListVideos).toHaveBeenCalledWith({ maxResults: 50, pageToken: undefined })
    })

    it('passes pageToken to YouTube client', async () => {
      mockListVideos.mockResolvedValueOnce({ videos: [], nextPageToken: undefined })

      await GET(createRequest({ pageToken: 'myPageToken' }) as never)

      expect(mockListVideos).toHaveBeenCalledWith({ maxResults: 50, pageToken: 'myPageToken' })
    })
  })

  describe('YouTube API errors', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user123' } } as never)
      mockGetUserTokens.mockResolvedValue({
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        needsRefresh: false,
      })
    })

    it('returns YOUTUBE_QUOTA error', async () => {
      mockListVideos.mockRejectedValueOnce(new YouTubeAPIError('YOUTUBE_QUOTA', 'Quota exceeded', 403))

      const response = await GET(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error.code).toBe('YOUTUBE_QUOTA')
    })

    it('returns YOUTUBE_NOT_FOUND error', async () => {
      mockListVideos.mockRejectedValueOnce(new YouTubeAPIError('YOUTUBE_NOT_FOUND', 'Not found', 404))

      const response = await GET(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error.code).toBe('YOUTUBE_NOT_FOUND')
    })

    it('returns YOUTUBE_FORBIDDEN error', async () => {
      mockListVideos.mockRejectedValueOnce(new YouTubeAPIError('YOUTUBE_FORBIDDEN', 'Forbidden', 403))

      const response = await GET(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error.code).toBe('YOUTUBE_FORBIDDEN')
    })

    it('returns INTERNAL_ERROR for unexpected errors', async () => {
      mockListVideos.mockRejectedValueOnce(new Error('Unexpected error'))

      const response = await GET(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
