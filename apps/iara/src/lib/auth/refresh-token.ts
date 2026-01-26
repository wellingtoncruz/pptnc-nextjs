import { z } from 'zod'

import { log } from '../logger'

/**
 * Google OAuth Token Refresh Response Schema
 * @see https://developers.google.com/identity/protocols/oauth2/web-server#offline
 */
const GoogleTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  scope: z.string(),
  token_type: z.literal('Bearer'),
  // NOTE: refresh_token is NOT returned in refresh responses (only on first auth)
})

/**
 * Error thrown when token refresh fails due to invalid/revoked refresh_token
 */
export class RefreshTokenError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_GRANT' | 'NETWORK_ERROR' | 'UNKNOWN'
  ) {
    super(message)
    this.name = 'RefreshTokenError'
  }
}

/**
 * Result of a successful token refresh
 */
export interface RefreshResult {
  accessToken: string
  expiresAt: number
}

/**
 * Refreshes an access token using the Google OAuth token endpoint.
 *
 * @param refreshToken - The refresh_token obtained during initial authorization
 * @returns New access token and expiration timestamp
 * @throws {RefreshTokenError} If refresh fails (invalid/revoked token, network error)
 *
 * @example
 * ```typescript
 * try {
 *   const { accessToken, expiresAt } = await refreshAccessToken(storedRefreshToken)
 *   // Use new accessToken for API calls
 * } catch (error) {
 *   if (error instanceof RefreshTokenError && error.code === 'INVALID_GRANT') {
 *     // Refresh token is invalid/revoked - user needs to re-authenticate
 *   }
 * }
 * ```
 */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
  const clientId = process.env.AUTH_GOOGLE_ID
  const clientSecret = process.env.AUTH_GOOGLE_SECRET

  if (!clientId || !clientSecret) {
    log('ERROR', 'Missing OAuth credentials for token refresh', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    })
    throw new RefreshTokenError(
      'OAuth credentials not configured',
      'UNKNOWN'
    )
  }

  log('INFO', 'Attempting token refresh')

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      const errorCode = errorBody?.error || 'unknown'
      const errorDescription = errorBody?.error_description || 'No description'

      log('WARN', 'Token refresh failed', {
        status: response.status,
        error: errorCode,
        description: errorDescription,
      })

      // invalid_grant means refresh_token is revoked or expired
      if (errorCode === 'invalid_grant') {
        throw new RefreshTokenError(
          `Refresh token invalid or revoked: ${errorDescription}`,
          'INVALID_GRANT'
        )
      }

      throw new RefreshTokenError(
        `Token refresh failed: ${errorCode} - ${errorDescription}`,
        'UNKNOWN'
      )
    }

    const data = await response.json()
    const parsed = GoogleTokenResponseSchema.safeParse(data)

    if (!parsed.success) {
      log('ERROR', 'Invalid token response format', {
        error: parsed.error.message,
      })
      throw new RefreshTokenError(
        'Invalid token response from Google',
        'UNKNOWN'
      )
    }

    // Calculate absolute expiration timestamp
    // expires_in is in seconds, convert to Unix timestamp in seconds
    const expiresAt = Math.floor(Date.now() / 1000) + parsed.data.expires_in

    log('INFO', 'Token refresh successful', {
      expiresIn: parsed.data.expires_in,
      expiresAt,
    })

    return {
      accessToken: parsed.data.access_token,
      expiresAt,
    }
  } catch (error) {
    // Re-throw RefreshTokenError as-is
    if (error instanceof RefreshTokenError) {
      throw error
    }

    // Network or other errors
    log('ERROR', 'Token refresh network error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw new RefreshTokenError(
      error instanceof Error ? error.message : 'Network error during token refresh',
      'NETWORK_ERROR'
    )
  }
}

/**
 * Checks if a token is expired or about to expire.
 *
 * @param expiresAt - Unix timestamp in seconds when the token expires
 * @param bufferSeconds - Seconds before expiration to consider as "expiring" (default: 300 = 5 min)
 * @returns true if token is expired or will expire within buffer period
 */
export function isTokenExpired(expiresAt: number | undefined, bufferSeconds = 300): boolean {
  if (!expiresAt) {
    return true // No expiration means we should refresh
  }

  const now = Math.floor(Date.now() / 1000)
  const threshold = expiresAt - bufferSeconds

  return now >= threshold
}
