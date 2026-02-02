/**
 * User management module for Firestore.
 *
 * Handles user document creation and updates in the users subcollection.
 * Path: podcasts/{podcastId}/users/{userId}
 *
 * CRITICAL: This module implements upsert logic to prevent duplicate users.
 * Uses Firestore transactions to prevent race conditions on concurrent logins.
 *
 * @see architecture-iara.md#Data Architecture
 * @see project-context-iara.md#Enforcement Rules
 */

import { FieldValue } from 'firebase-admin/firestore'

import { SaveUserInputSchema, UserSchema } from '@/lib/schemas'
import { log } from '@/lib/logger'
import type { User } from '@/types/user'

import { getAdminDb } from './admin'
import { PODCAST_ID } from './config'

/**
 * Input for saving/updating a user.
 */
export interface SaveUserInput {
  email: string
  name: string | null
  picture?: string | null
}

/**
 * Gets the Firestore reference for a user document.
 * Path: podcasts/{podcastId}/users/{userId}
 */
function getUserRef(userId: string) {
  const db = getAdminDb()
  return db
    .collection('podcasts')
    .doc(PODCAST_ID)
    .collection('users')
    .doc(userId)
}

/**
 * Saves or updates a user document in Firestore.
 *
 * Implements upsert logic with transaction to prevent race conditions:
 * - If user does NOT exist: creates new document with default role 'user'
 * - If user exists: updates name, picture, and lastAccessAt (preserves role, email)
 *
 * CRITICAL: Uses transaction to prevent duplicate users on concurrent logins.
 *
 * @deprecated Use createOrUpdateUserOnLogin from users-admin.ts for new code.
 * This function is kept for backwards compatibility.
 *
 * @param userId - The user's unique identifier (from Auth.js token.sub)
 * @param input - User data from Google OAuth profile
 */
export async function saveOrUpdateUser(userId: string, input: SaveUserInput): Promise<void> {
  // Rule #2: Validate with Zod before persisting
  const validated = SaveUserInputSchema.parse(input)

  const db = getAdminDb()
  const userRef = getUserRef(userId)

  // Use transaction to prevent race conditions on concurrent logins
  await db.runTransaction(async (transaction) => {
    const existingDoc = await transaction.get(userRef)

    if (existingDoc.exists) {
      // UPDATE: User exists - only update name, picture, and lastAccessAt
      // CRITICAL: Do NOT overwrite email or role
      transaction.update(userRef, {
        name: validated.name,
        picture: validated.picture ?? null,
        lastAccessAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      log('INFO', 'User document updated', {
        userId,
        podcastId: PODCAST_ID,
        name: validated.name,
        hasPicture: !!validated.picture,
      })
    } else {
      // CREATE: New user - set all fields including default role
      transaction.set(userRef, {
        id: userId,
        email: validated.email,
        name: validated.name,
        picture: validated.picture ?? null,
        role: 'user', // Default role for new users
        lastAccessAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        deleted: false,
      })

      log('INFO', 'User document created', {
        userId,
        podcastId: PODCAST_ID,
        email: validated.email,
        name: validated.name,
        role: 'user',
      })
    }
  })
}

/**
 * Retrieves a user document from Firestore.
 *
 * Returns null for soft-deleted users (deleted: true).
 *
 * @param userId - The user's unique identifier
 * @returns The user document or null if not found or deleted
 */
export async function getUser(userId: string): Promise<User | null> {
  const userRef = getUserRef(userId)

  const doc = await userRef.get()
  if (!doc.exists) {
    log('INFO', 'User not found', { userId, podcastId: PODCAST_ID })
    return null
  }

  const data = doc.data()

  // Check for soft-deleted users
  if (data?.deleted === true) {
    log('INFO', 'User is soft-deleted', { userId, podcastId: PODCAST_ID })
    return null
  }

  return UserSchema.parse(data)
}
