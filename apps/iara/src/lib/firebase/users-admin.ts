/**
 * User management operations using Admin SDK.
 *
 * Handles podcast-scoped user operations for role-based access control.
 * Path: podcasts/{podcastId}/users/{oderId}
 * where oderId is the OAuth provider user ID (Google User ID)
 *
 * CRITICAL: Never expose admin SDK to the client.
 *
 * @see architecture-iara.md#Data Architecture
 * @see docs/stories/8-1-modelo-roles-permissoes.md
 */

import { FieldValue } from 'firebase-admin/firestore'
import { ZodError } from 'zod'

import { UserSchema } from '@/lib/schemas'
import { log } from '@/lib/logger'
import type { User, UserRole } from '@/types/user'

import { getAdminDb } from './admin'

/**
 * Gets the Firestore reference for a user document.
 * Path: podcasts/{podcastId}/users/{oderId}
 */
function getUserRef(podcastId: string, oderId: string) {
  const db = getAdminDb()
  return db.collection('podcasts').doc(podcastId).collection('users').doc(oderId)
}

/**
 * Gets a podcast user by their OAuth ID.
 *
 * @param podcastId - The podcast document ID
 * @param oderId - The OAuth user ID (Google User ID)
 * @returns The validated user document or null if not found
 * @throws ZodError if document data fails validation
 */
export async function getPodcastUser(
  podcastId: string,
  oderId: string
): Promise<User | null> {
  const userRef = getUserRef(podcastId, oderId)

  try {
    const docSnap = await userRef.get()

    if (!docSnap.exists) {
      log('INFO', 'Podcast user not found', { podcastId, oderId })
      return null
    }

    const data = docSnap.data()

    // Check for soft-deleted users
    if (data?.deleted === true) {
      log('INFO', 'Podcast user is deleted', { podcastId, oderId })
      return null
    }

    return UserSchema.parse(data)
  } catch (error) {
    if (error instanceof ZodError) {
      log('ERROR', 'User data validation failed', { podcastId, oderId, issues: error.issues })
    } else {
      log('ERROR', 'Failed to get podcast user', { podcastId, oderId, error })
    }
    throw error
  }
}

/**
 * Creates or updates a user document on login.
 *
 * Implements upsert logic:
 * - If user does NOT exist: creates new document with role='user'
 * - If user exists: updates lastAccessAt only (preserves role, email)
 *
 * Note: OAuth profile uses `displayName` which maps to schema field `name`.
 *
 * @param podcastId - The podcast document ID
 * @param userData - User data from OAuth profile (displayName maps to name)
 * @returns The user document
 */
export async function createOrUpdateUserOnLogin(
  podcastId: string,
  userData: {
    oderId: string
    email: string
    displayName: string | null // Maps to schema field 'name'
    photoURL?: string | null   // Maps to schema field 'picture'
  }
): Promise<User> {
  const db = getAdminDb()
  const userRef = getUserRef(podcastId, userData.oderId)

  // Use transaction to prevent race conditions on concurrent logins
  const result = await db.runTransaction(async (transaction) => {
    const existingDoc = await transaction.get(userRef)

    if (existingDoc.exists) {
      const existingData = existingDoc.data()

      // Check if user was soft-deleted - reactivate on login
      if (existingData?.deleted === true) {
        log('INFO', 'Reactivating deleted user on login', {
          podcastId,
          oderId: userData.oderId,
        })
      }

      // UPDATE: User exists - only update lastAccessAt, name, picture
      // CRITICAL: Do NOT overwrite email or role
      transaction.update(userRef, {
        name: userData.displayName,
        picture: userData.photoURL ?? null,
        lastAccessAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        deleted: false, // Reactivate if was deleted
      })

      log('INFO', 'User lastAccessAt updated', {
        podcastId,
        oderId: userData.oderId,
      })

      return 'updated'
    } else {
      // CREATE: New user - set all fields including default role
      transaction.set(userRef, {
        id: userData.oderId,
        email: userData.email,
        name: userData.displayName,
        picture: userData.photoURL ?? null,
        role: 'user', // Default role for new users
        lastAccessAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        deleted: false,
      })

      log('INFO', 'Podcast user created', {
        podcastId,
        oderId: userData.oderId,
        email: userData.email,
        role: 'user',
      })

      return 'created'
    }
  })

  // Fetch the updated/created document to return
  const userDoc = await userRef.get()
  return UserSchema.parse(userDoc.data())
}

/**
 * Checks if a user has admin role.
 *
 * @param podcastId - The podcast document ID
 * @param oderId - The OAuth user ID
 * @returns True if user has admin role, false otherwise
 */
export async function isAdmin(podcastId: string, oderId: string): Promise<boolean> {
  const user = await getPodcastUser(podcastId, oderId)
  return user?.role === 'admin'
}

/**
 * Gets the user's role.
 *
 * @param podcastId - The podcast document ID
 * @param oderId - The OAuth user ID
 * @returns The user's role or null if user not found
 */
export async function getUserRole(
  podcastId: string,
  oderId: string
): Promise<UserRole | null> {
  const user = await getPodcastUser(podcastId, oderId)
  return user?.role ?? null
}

/**
 * Updates a user's role.
 *
 * @param podcastId - The podcast document ID
 * @param oderId - The OAuth user ID
 * @param role - The new role to set
 */
export async function updateUserRole(
  podcastId: string,
  oderId: string,
  role: UserRole
): Promise<void> {
  const userRef = getUserRef(podcastId, oderId)

  await userRef.update({
    role,
    updatedAt: FieldValue.serverTimestamp(),
  })

  log('INFO', 'User role updated', { podcastId, oderId, role })
}

/**
 * Soft deletes a user (sets deleted=true).
 *
 * @param podcastId - The podcast document ID
 * @param oderId - The OAuth user ID
 */
export async function softDeleteUser(podcastId: string, oderId: string): Promise<void> {
  const userRef = getUserRef(podcastId, oderId)

  await userRef.update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  })

  log('INFO', 'User soft deleted', { podcastId, oderId })
}

/**
 * Lists all non-deleted users for a podcast.
 *
 * Note: We fetch all users and filter in memory because Firestore's
 * where('deleted', '==', false) doesn't match documents where the
 * field is missing/undefined (legacy users may not have this field).
 *
 * @param podcastId - The podcast document ID
 * @returns Array of user documents
 */
export async function listPodcastUsers(podcastId: string): Promise<User[]> {
  const db = getAdminDb()
  const usersRef = db.collection('podcasts').doc(podcastId).collection('users')

  // Fetch all users and filter soft-deleted in memory
  // This handles legacy users that may not have the 'deleted' field
  const snapshot = await usersRef.get()

  const users: User[] = []
  for (const doc of snapshot.docs) {
    try {
      const data = doc.data()

      // Skip soft-deleted users (deleted === true)
      // Include users where deleted is false, undefined, or missing
      if (data.deleted === true) {
        continue
      }

      // Use document ID as fallback for id field (legacy users)
      const dataWithId = {
        ...data,
        id: data.id ?? doc.id,
      }

      users.push(UserSchema.parse(dataWithId))
    } catch (error) {
      log('WARN', 'Skipping invalid user document', {
        podcastId,
        docId: doc.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return users
}

/**
 * Counts the number of admins for a podcast.
 *
 * Note: We fetch all admins and filter in memory because Firestore's
 * where('deleted', '==', false) doesn't match documents where the
 * field is missing/undefined (legacy users may not have this field).
 *
 * @param podcastId - The podcast document ID
 * @returns Number of admin users
 */
export async function countAdmins(podcastId: string): Promise<number> {
  const db = getAdminDb()
  const usersRef = db.collection('podcasts').doc(podcastId).collection('users')

  // Query by role only, then filter deleted in memory (handles legacy users)
  const snapshot = await usersRef.where('role', '==', 'admin').get()

  let count = 0
  for (const doc of snapshot.docs) {
    const data = doc.data()
    // Include users where deleted is false, undefined, or missing
    if (data.deleted !== true) {
      count++
    }
  }

  return count
}
