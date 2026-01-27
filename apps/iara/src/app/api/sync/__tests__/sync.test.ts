import { beforeEach, describe, expect, it, vi } from 'vitest'

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

// Mock syncVideos
vi.mock('@/lib/sync/sync-videos', () => ({
  syncVideos: vi.fn(),
}))

// Mock firebase config
vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { getUserTokensWithExpiry, refreshUserToken, TokenRefreshError } from '@/lib/firebase/tokens'
import { syncVideos } from '@/lib/sync/sync-videos'

import { POST } from '../route'

const mockAuth = vi.mocked(auth)
const mockGetUserTokens = vi.mocked(getUserTokensWithExpiry)
const mockRefreshToken = vi.mocked(refreshUserToken)
const mockSyncVideos = vi.mocked(syncVideos)

describe('POST /api/sync', () => {
  const createRequest = () => {
    return { url: 'http://localhost:3000/api/sync' } as Request
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('authentication', () => {
    it('returns 401 when no session', async () => {
      mockAuth.mockResolvedValueOnce(null)

      const response = await POST(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTH_EXPIRED')
    })

    it('returns 401 when session has no user id', async () => {
      mockAuth.mockResolvedValueOnce({ user: {} } as never)

      const response = await POST(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTH_EXPIRED')
    })

    it('returns 401 when no tokens found', async () => {
      mockAuth.mockResolvedValueOnce({ user: { id: 'user123' } } as never)
      mockGetUserTokens.mockResolvedValueOnce(null)

      const response = await POST(createRequest() as never)
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
      mockSyncVideos.mockResolvedValueOnce({ added: 0, updated: 0, deleted: 0 })

      const response = await POST(createRequest() as never)

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

      const response = await POST(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('TOKEN_REFRESH_FAILED')
    })
  })

  describe('successful sync', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user123' } } as never)
      mockGetUserTokens.mockResolvedValue({
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        needsRefresh: false,
      })
    })

    it('returns sync result with counts (AC #4)', async () => {
      mockSyncVideos.mockResolvedValueOnce({ added: 5, updated: 3, deleted: 1 })

      const response = await POST(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toEqual({ added: 5, updated: 3, deleted: 1 })
    })

    it('calls syncVideos with correct parameters', async () => {
      mockSyncVideos.mockResolvedValueOnce({ added: 0, updated: 0, deleted: 0 })

      await POST(createRequest() as never)

      expect(mockSyncVideos).toHaveBeenCalledWith('pptnc', 'valid-token')
    })
  })

  describe('error handling', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user123' } } as never)
      mockGetUserTokens.mockResolvedValue({
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        needsRefresh: false,
      })
    })

    it('returns 404 when podcast not found', async () => {
      mockSyncVideos.mockRejectedValueOnce(new Error('Podcast not found: pptnc'))

      const response = await POST(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error.code).toBe('PODCAST_NOT_FOUND')
    })

    it('returns 500 for unexpected errors', async () => {
      mockSyncVideos.mockRejectedValueOnce(new Error('Unexpected error'))

      const response = await POST(createRequest() as never)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error.code).toBe('INTERNAL_ERROR')
    })

  })
})
