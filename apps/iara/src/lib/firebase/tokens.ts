/**
 * Token storage module for persisting OAuth tokens in Firestore.
 *
 * CRITICAL: refresh_token is ONLY sent by Google on first authorization.
 * This module MUST preserve existing refresh_token and NEVER overwrite it.
 *
 * Collection structure (white-label ready):
 *   podcasts/{podcastId}/users/{userId}/tokens/oauth
 *
 * @see https://developers.google.com/identity/protocols/oauth2#5.-refresh-the-access-token,-if-necessary.
 */

import { FieldValue } from 'firebase-admin/firestore'
import { z } from 'zod'

import { log } from '../logger'

import { getAdminDb } from './admin'
import { PODCAST_ID } from './config'

/**
 * Zod schema for validating token input before persistence.
 * Enforces Rule #2: Validate all external API data with Zod before persisting.
 */
export const SaveTokensInputSchema = z.object({
  accessToken: z.string().min(1, 'accessToken is required'),
  refreshToken: z.string().optional(),
  expiresAt: z.number().positive().optional(),
})

/**
 * User tokens stored in Firestore.
 */
export interface UserTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  updatedAt?: FirebaseFirestore.Timestamp
}

/**
 * Input for saving user tokens.
 * Derived from Zod schema for type safety.
 */
export type SaveTokensInput = z.infer<typeof SaveTokensInputSchema>

/**
 * Gets the Firestore reference for user tokens.
 * Path: podcasts/{podcastId}/users/{userId}/tokens/oauth
 */
function getTokenRef(userId: string) {
  const db = getAdminDb()
  return db
    .collection('podcasts')
    .doc(PODCAST_ID)
    .collection('users')
    .doc(userId)
    .collection('tokens')
    .doc('oauth')
}

/**
 * Saves user tokens to Firestore with refresh_token preservation.
 *
 * CRITICAL: refresh_token is ONLY sent on first authorization.
 * This function MUST check if refresh_token already exists before overwriting.
 *
 * @param userId - The user's unique identifier (from Auth.js token.sub)
 * @param tokens - The tokens to save
 */
export async function saveUserTokens(userId: string, tokens: SaveTokensInput): Promise<void> {
  // Rule #2: Validate with Zod before persisting
  const validatedTokens = SaveTokensInputSchema.parse(tokens)

  const tokenRef = getTokenRef(userId)

  // Check if document exists and has refresh_token
  const existingDoc = await tokenRef.get()
  const existingData = existingDoc.data() as UserTokens | undefined

  const updateData: Record<string, unknown> = {
    accessToken: validatedTokens.accessToken,
    expiresAt: validatedTokens.expiresAt,
    updatedAt: FieldValue.serverTimestamp(),
  }

  // CRITICAL: Only save refresh_token if:
  // 1. It's provided in the new tokens (first authorization)
  // 2. AND there's no existing refresh_token
  if (validatedTokens.refreshToken && !existingData?.refreshToken) {
    updateData.refreshToken = validatedTokens.refreshToken
    log('INFO', 'Refresh token saved (first authorization)', { userId, podcastId: PODCAST_ID })
  } else if (validatedTokens.refreshToken && existingData?.refreshToken) {
    log('INFO', 'Refresh token preserved (not overwritten)', { userId, podcastId: PODCAST_ID })
  } else if (!validatedTokens.refreshToken && !existingData?.refreshToken) {
    log('WARN', 'No refresh token available', { userId, podcastId: PODCAST_ID })
  }

  await tokenRef.set(updateData, { merge: true })

  log('INFO', 'User tokens saved to Firestore', {
    userId,
    podcastId: PODCAST_ID,
    hasAccessToken: !!validatedTokens.accessToken,
    hasRefreshToken: !!updateData.refreshToken || !!existingData?.refreshToken,
    expiresAt: validatedTokens.expiresAt,
  })
}

/**
 * Retrieves user tokens from Firestore.
 *
 * @param userId - The user's unique identifier
 * @returns The user's tokens or null if not found
 */
export async function getUserTokens(userId: string): Promise<UserTokens | null> {
  const tokenRef = getTokenRef(userId)

  const doc = await tokenRef.get()
  if (!doc.exists) {
    log('INFO', 'No tokens found for user', { userId, podcastId: PODCAST_ID })
    return null
  }

  return doc.data() as UserTokens
}

/**
 * User tokens with expiry check result.
 */
export interface UserTokensWithExpiry extends UserTokens {
  needsRefresh: boolean
}

/**
 * Token refresh error.
 */
export class TokenRefreshError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message)
    this.name = 'TokenRefreshError'
  }
}

/**
 * Retrieves user tokens with expiry check.
 *
 * Checks if the access token is expired or about to expire (within 5 minutes).
 *
 * @param userId - The user's unique identifier
 * @returns User tokens with needsRefresh flag, or null if not found
 */
export async function getUserTokensWithExpiry(userId: string): Promise<UserTokensWithExpiry | null> {
  const tokens = await getUserTokens(userId)
  if (!tokens) {
    return null
  }

  // Check if token is expired or will expire in 5 minutes
  // NOTE: expiresAt is stored in SECONDS (Unix timestamp), not milliseconds
  const EXPIRY_BUFFER_SECONDS = 5 * 60 // 5 minutes
  const nowSeconds = Math.floor(Date.now() / 1000)
  const needsRefresh = tokens.expiresAt
    ? nowSeconds > tokens.expiresAt - EXPIRY_BUFFER_SECONDS
    : false

  return { ...tokens, needsRefresh }
}

/**
 * Refreshes the user's access token using the refresh token.
 *
 * Calls Google OAuth token endpoint to get a new access token.
 * Updates Firestore with the new access token and expiry.
 *
 * CRITICAL: This function NEVER overwrites the refresh_token.
 *
 * @param userId - The user's unique identifier
 * @param refreshToken - The refresh token to use
 * @returns New user tokens with needsRefresh = false
 * @throws TokenRefreshError if refresh fails
 */
export async function refreshUserToken(
  userId: string,
  refreshToken: string
): Promise<UserTokensWithExpiry> {
  const clientId = process.env.AUTH_GOOGLE_ID
  const clientSecret = process.env.AUTH_GOOGLE_SECRET

  if (!clientId || !clientSecret) {
    log('ERROR', 'Missing Google OAuth credentials', { userId })
    throw new TokenRefreshError('Missing Google OAuth credentials')
  }

  log('INFO', 'Refreshing user access token', { userId, podcastId: PODCAST_ID })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    log('ERROR', 'Token refresh failed', {
      userId,
      status: response.status,
      error: errorBody,
    })
    throw new TokenRefreshError(
      `Failed to refresh token: ${errorBody?.error_description || response.statusText}`,
      response.status
    )
  }

  const data = await response.json()
  // NOTE: expiresAt is stored in SECONDS (Unix timestamp), not milliseconds
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in

  // Update Firestore with new access token (preserve refresh_token)
  const tokenRef = getTokenRef(userId)
  await tokenRef.update({
    accessToken: data.access_token,
    expiresAt,
    updatedAt: FieldValue.serverTimestamp(),
    // ⚠️ NUNCA sobrescrever refreshToken - it's preserved
  })

  log('INFO', 'Token refreshed successfully', { userId, podcastId: PODCAST_ID })

  return {
    accessToken: data.access_token,
    refreshToken, // Return the original (unchanged)
    expiresAt,
    needsRefresh: false,
  }
}
