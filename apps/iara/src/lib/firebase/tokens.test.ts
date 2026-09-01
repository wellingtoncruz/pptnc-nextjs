import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  },
}))

// Mock the admin module
vi.mock('./admin', () => ({
  getAdminDb: vi.fn(),
}))

// Mock the config module
vi.mock('./config', () => ({
  PODCAST_ID: 'test-podcast',
  PROJECT_ID: 'test-project',
  FIRESTORE_DATABASE_ID: 'test-db',
}))

// Mock the logger
vi.mock('../logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { getAdminDb } from './admin'
import { PODCAST_ID } from './config'
import { getUserTokens, saveUserTokens, SaveTokensInputSchema } from './tokens'
import { log } from '../logger'

describe('SaveTokensInputSchema validation', () => {
  it('validates valid token input', () => {
    const validInput = {
      accessToken: 'valid-access-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: 1234567890,
    }
    expect(() => SaveTokensInputSchema.parse(validInput)).not.toThrow()
  })

  it('rejects empty accessToken', () => {
    const invalidInput = {
      accessToken: '',
      expiresAt: 1234567890,
    }
    expect(() => SaveTokensInputSchema.parse(invalidInput)).toThrow('accessToken is required')
  })

  it('rejects missing accessToken', () => {
    const invalidInput = {
      refreshToken: 'some-token',
    }
    expect(() => SaveTokensInputSchema.parse(invalidInput)).toThrow()
  })

  it('rejects negative expiresAt', () => {
    const invalidInput = {
      accessToken: 'valid-token',
      expiresAt: -1,
    }
    expect(() => SaveTokensInputSchema.parse(invalidInput)).toThrow()
  })

  it('allows optional refreshToken and expiresAt', () => {
    const minimalInput = {
      accessToken: 'valid-access-token',
    }
    expect(() => SaveTokensInputSchema.parse(minimalInput)).not.toThrow()
  })
})

describe('token storage', () => {
  let mockTokenRef: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }
  let mockUsersCollection: ReturnType<typeof vi.fn>
  let mockPodcastDoc: ReturnType<typeof vi.fn>
  let mockDb: { collection: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()

    mockTokenRef = {
      get: vi.fn(),
      set: vi.fn(),
    }

    // Build the nested mock structure for:
    // podcasts/{podcastId}/users/{userId}/tokens/oauth
    mockUsersCollection = vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => mockTokenRef),
        })),
      })),
    }))

    mockPodcastDoc = vi.fn(() => ({
      collection: mockUsersCollection,
    }))

    mockDb = {
      collection: vi.fn(() => ({
        doc: mockPodcastDoc,
      })),
    }

    vi.mocked(getAdminDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getAdminDb>)
  })

  describe('Firestore path structure', () => {
    it('accesses correct path: podcasts/{podcastId}/users/{userId}/tokens/oauth', async () => {
      mockTokenRef.get.mockResolvedValue({
        exists: false,
        data: () => undefined,
      })
      mockTokenRef.set.mockResolvedValue(undefined)

      await saveUserTokens('user-123', {
        accessToken: 'test-access',
        expiresAt: 1234567890,
      })

      // Verify the path structure
      expect(mockDb.collection).toHaveBeenCalledWith('podcasts')
      expect(mockPodcastDoc).toHaveBeenCalledWith(PODCAST_ID)
      expect(mockUsersCollection).toHaveBeenCalledWith('users')
    })

    it('includes podcastId in log messages', async () => {
      mockTokenRef.get.mockResolvedValue({
        exists: false,
        data: () => undefined,
      })
      mockTokenRef.set.mockResolvedValue(undefined)

      await saveUserTokens('user-123', {
        accessToken: 'test-access',
        refreshToken: 'test-refresh',
        expiresAt: 1234567890,
      })

      expect(log).toHaveBeenCalledWith(
        'INFO',
        'Refresh token saved (first authorization)',
        expect.objectContaining({ podcastId: PODCAST_ID })
      )
    })
  })

  describe('saveUserTokens', () => {
    it('saves access_token and refresh_token on first authorization', async () => {
      // First authorization - no existing document
      mockTokenRef.get.mockResolvedValue({
        exists: false,
        data: () => undefined,
      })
      mockTokenRef.set.mockResolvedValue(undefined)

      await saveUserTokens('user-123', {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: 1234567890,
      })

      expect(mockTokenRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresAt: 1234567890,
        }),
        { merge: true }
      )

      expect(log).toHaveBeenCalledWith('INFO', 'Refresh token saved (first authorization)', {
        userId: 'user-123',
        podcastId: PODCAST_ID,
      })
    })

    it('ROTATES the refresh_token on re-authorization (incident 2026-09-01)', async () => {
      // Re-login com prompt=consent: o Google emite refresh token NOVO e pode
      // revogar o anterior (grant mudou — ex.: escopo novo). Preservar o
      // antigo deixava o doc com um token morto e o job diário falhava com
      // invalid_grant.
      mockTokenRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ refreshToken: 'original-refresh-token' }),
      })
      mockTokenRef.set.mockResolvedValue(undefined)

      await saveUserTokens('user-123', {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: 1234567890,
      })

      const setCallArgs = mockTokenRef.set.mock.calls[0]
      const updateData = setCallArgs[0] as Record<string, unknown>

      expect(updateData.refreshToken).toBe('new-refresh-token')
      expect(setCallArgs[1]).toEqual({ merge: true })
      expect(log).toHaveBeenCalledWith('INFO', 'Refresh token rotated (re-authorization)', {
        userId: 'user-123',
        podcastId: PODCAST_ID,
      })
    })

    it('preserves the stored refresh_token when the save has none (refresh response)', async () => {
      mockTokenRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ refreshToken: 'original-refresh-token' }),
      })
      mockTokenRef.set.mockResolvedValue(undefined)

      await saveUserTokens('user-123', {
        accessToken: 'refreshed-access-token',
        expiresAt: 1234567890,
      })

      const updateData = mockTokenRef.set.mock.calls[0][0] as Record<string, unknown>
      expect(updateData).not.toHaveProperty('refreshToken')
      expect(log).toHaveBeenCalledWith(
        'INFO',
        'Refresh token preserved (refresh response has none)',
        { userId: 'user-123', podcastId: PODCAST_ID }
      )
    })

    it('saves refresh_token when document exists but has no refresh_token', async () => {
      // Document exists but no refresh_token (edge case)
      mockTokenRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ accessToken: 'old-access-token' }), // No refreshToken
      })
      mockTokenRef.set.mockResolvedValue(undefined)

      await saveUserTokens('user-123', {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: 1234567890,
      })

      expect(mockTokenRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          refreshToken: 'new-refresh-token',
        }),
        { merge: true }
      )
    })

    it('warns when no refresh_token is available', async () => {
      // No existing document and no refresh_token provided
      mockTokenRef.get.mockResolvedValue({
        exists: false,
        data: () => undefined,
      })
      mockTokenRef.set.mockResolvedValue(undefined)

      await saveUserTokens('user-123', {
        accessToken: 'new-access-token',
        // No refreshToken
        expiresAt: 1234567890,
      })

      expect(log).toHaveBeenCalledWith('WARN', 'No refresh token available', {
        userId: 'user-123',
        podcastId: PODCAST_ID,
      })
    })

    it('includes serverTimestamp in update data', async () => {
      mockTokenRef.get.mockResolvedValue({
        exists: false,
        data: () => undefined,
      })
      mockTokenRef.set.mockResolvedValue(undefined)

      await saveUserTokens('user-123', {
        accessToken: 'test-access',
        expiresAt: 1234567890,
      })

      expect(mockTokenRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          updatedAt: 'SERVER_TIMESTAMP',
        }),
        { merge: true }
      )
    })

    it('logs successful token save with podcastId', async () => {
      mockTokenRef.get.mockResolvedValue({
        exists: false,
        data: () => undefined,
      })
      mockTokenRef.set.mockResolvedValue(undefined)

      await saveUserTokens('user-123', {
        accessToken: 'test-access',
        refreshToken: 'test-refresh',
        expiresAt: 1234567890,
      })

      expect(log).toHaveBeenCalledWith('INFO', 'User tokens saved to Firestore', {
        userId: 'user-123',
        podcastId: PODCAST_ID,
        hasAccessToken: true,
        hasRefreshToken: true,
        expiresAt: 1234567890,
      })
    })
  })

  describe('getUserTokens', () => {
    it('returns tokens when they exist', async () => {
      mockTokenRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          accessToken: 'test-access',
          refreshToken: 'test-refresh',
          expiresAt: 1234567890,
        }),
      })

      const tokens = await getUserTokens('user-123')

      expect(tokens).toEqual({
        accessToken: 'test-access',
        refreshToken: 'test-refresh',
        expiresAt: 1234567890,
      })
    })

    it('returns null when no tokens exist', async () => {
      mockTokenRef.get.mockResolvedValue({
        exists: false,
        data: () => undefined,
      })

      const tokens = await getUserTokens('user-123')

      expect(tokens).toBeNull()
      expect(log).toHaveBeenCalledWith('INFO', 'No tokens found for user', {
        userId: 'user-123',
        podcastId: PODCAST_ID,
      })
    })
  })
})
