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
