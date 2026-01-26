import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  isTokenExpired,
  refreshAccessToken,
  RefreshTokenError,
} from './refresh-token'

// Mock the logger
vi.mock('../logger', () => ({
  log: vi.fn(),
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('refresh-token', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      AUTH_GOOGLE_ID: 'test-client-id',
      AUTH_GOOGLE_SECRET: 'test-client-secret',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('refreshAccessToken', () => {
    it('returns new access token on successful refresh', async () => {
      const mockResponse = {
        access_token: 'new-access-token',
        expires_in: 3600,
        scope: 'openid email profile',
        token_type: 'Bearer' as const,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await refreshAccessToken('valid-refresh-token')

      expect(result.accessToken).toBe('new-access-token')
      expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      )
    })

    it('includes correct parameters in refresh request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-token',
            expires_in: 3600,
            scope: 'test',
            token_type: 'Bearer',
          }),
      })

      await refreshAccessToken('my-refresh-token')

      const [, options] = mockFetch.mock.calls[0]
      const body = new URLSearchParams(options.body as string)

      expect(body.get('client_id')).toBe('test-client-id')
      expect(body.get('client_secret')).toBe('test-client-secret')
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('my-refresh-token')
    })

    it('throws INVALID_GRANT error when refresh_token is revoked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'Token has been revoked.',
          }),
      })

      try {
        await refreshAccessToken('revoked-token')
        // Should not reach here
        expect.fail('Expected RefreshTokenError to be thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(RefreshTokenError)
        expect((error as RefreshTokenError).code).toBe('INVALID_GRANT')
      }
    })

    it('throws INVALID_GRANT error when refresh_token is expired', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.',
          }),
      })

      await expect(refreshAccessToken('expired-token')).rejects.toThrow(
        RefreshTokenError
      )
    })

    it('throws UNKNOWN error for non-invalid_grant errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            error: 'server_error',
            error_description: 'Internal server error',
          }),
      })

      try {
        await refreshAccessToken('valid-token')
      } catch (error) {
        expect(error).toBeInstanceOf(RefreshTokenError)
        expect((error as RefreshTokenError).code).toBe('UNKNOWN')
      }
    })

    it('throws NETWORK_ERROR on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      try {
        await refreshAccessToken('valid-token')
      } catch (error) {
        expect(error).toBeInstanceOf(RefreshTokenError)
        expect((error as RefreshTokenError).code).toBe('NETWORK_ERROR')
      }
    })

    it('throws error when OAuth credentials are missing', async () => {
      process.env.AUTH_GOOGLE_ID = ''
      process.env.AUTH_GOOGLE_SECRET = ''

      await expect(refreshAccessToken('valid-token')).rejects.toThrow(
        RefreshTokenError
      )
    })

    it('throws error when response has invalid format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            invalid: 'response',
          }),
      })

      await expect(refreshAccessToken('valid-token')).rejects.toThrow(
        RefreshTokenError
      )
    })

    it('calculates expiresAt correctly from expires_in', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000)
      const expiresIn = 3600 // 1 hour

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-token',
            expires_in: expiresIn,
            scope: 'test',
            token_type: 'Bearer',
          }),
      })

      const result = await refreshAccessToken('valid-token')

      // expiresAt should be approximately now + expires_in
      expect(result.expiresAt).toBeGreaterThanOrEqual(nowSeconds + expiresIn - 1)
      expect(result.expiresAt).toBeLessThanOrEqual(nowSeconds + expiresIn + 1)
    })
  })

  describe('isTokenExpired', () => {
    it('returns true when expiresAt is undefined', () => {
      expect(isTokenExpired(undefined)).toBe(true)
    })

    it('returns true when token is already expired', () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      expect(isTokenExpired(pastTimestamp)).toBe(true)
    })

    it('returns true when token is within buffer period (default 5 min)', () => {
      const almostExpired = Math.floor(Date.now() / 1000) + 60 // 1 minute from now
      expect(isTokenExpired(almostExpired)).toBe(true)
    })

    it('returns false when token has more than buffer time remaining', () => {
      const valid = Math.floor(Date.now() / 1000) + 600 // 10 minutes from now
      expect(isTokenExpired(valid)).toBe(false)
    })

    it('respects custom buffer seconds', () => {
      const timestamp = Math.floor(Date.now() / 1000) + 60 // 1 minute from now

      // With default 5 min buffer, should be expired
      expect(isTokenExpired(timestamp)).toBe(true)

      // With 30 second buffer, should not be expired
      expect(isTokenExpired(timestamp, 30)).toBe(false)
    })

    it('returns true when token expires exactly at buffer boundary', () => {
      const buffer = 300 // 5 minutes
      const atBoundary = Math.floor(Date.now() / 1000) + buffer
      expect(isTokenExpired(atBoundary, buffer)).toBe(true)
    })
  })
})
