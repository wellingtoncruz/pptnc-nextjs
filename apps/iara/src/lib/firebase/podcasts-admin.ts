/**
 * Podcast Firestore operations using Admin SDK.
 *
 * Use these functions in Route Handlers and Server Components.
 * For client-side reads, use podcasts.ts instead.
 *
 * CRITICAL: Never expose admin SDK to the client.
 *
 * @see architecture-iara.md#Data Architecture
 * @see project-context-iara.md#Enforcement Rules
 */

import { FieldValue } from 'firebase-admin/firestore'
import { ZodError } from 'zod'

import { PodcastSchema, PodcastCreateSchema, PodcastUpdateSchema } from '@/lib/schemas'
import { log } from '@/lib/logger'
import type { Podcast, PodcastCreate, PodcastUpdate } from '@/types/podcast'

import { getAdminDb } from './admin'

/**
 * Gets a podcast document by ID (admin context).
 *
 * @param podcastId - The podcast document ID
 * @returns The validated podcast document or null if not found
 * @throws ZodError if document data fails validation
 */
export async function getPodcastAdmin(podcastId: string): Promise<Podcast | null> {
  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId)

  try {
    const docSnap = await docRef.get()

    if (!docSnap.exists) {
      log('INFO', 'Podcast not found (admin)', { podcastId })
      return null
    }

    const data = { id: docSnap.id, ...docSnap.data() }
    return PodcastSchema.parse(data)
  } catch (error) {
    if (error instanceof ZodError) {
      log('ERROR', 'Podcast data validation failed (admin)', { podcastId, issues: error.issues })
    } else {
      log('ERROR', 'Failed to get podcast (admin)', { podcastId, error })
    }
    throw error
  }
}

/**
 * Creates a new podcast document.
 *
 * Validates input with Zod BEFORE persisting (enforcement rule #2).
 * Uses FieldValue.serverTimestamp() for timestamps (enforcement rule #12).
 *
 * @param podcastId - The podcast document ID to create
 * @param data - Podcast data (without id, createdAt, updatedAt)
 * @returns The created podcast document
 * @throws ZodError if input data fails validation
 */
export async function createPodcastAdmin(
  podcastId: string,
  data: PodcastCreate
): Promise<Podcast> {
  // Validate BEFORE persisting (enforcement rule #2)
  const validated = PodcastCreateSchema.parse(data)

  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId)
  const now = FieldValue.serverTimestamp()

  try {
    // Check if document already exists to prevent silent overwrite
    const existing = await docRef.get()
    if (existing.exists) {
      throw new Error(`Podcast already exists: ${podcastId}`)
    }

    await docRef.set({
      ...validated,
      createdAt: now,
      updatedAt: now,
    })

    log('INFO', 'Podcast created (admin)', { podcastId })

    // Fetch the created document to return with resolved timestamps
    const created = await docRef.get()
    const createdData = { id: created.id, ...created.data() }
    return PodcastSchema.parse(createdData)
  } catch (error) {
    log('ERROR', 'Failed to create podcast (admin)', { podcastId, error })
    throw error
  }
}

/**
 * Updates a podcast document with field-level merge (admin context).
 *
 * Validates input with Zod BEFORE persisting (enforcement rule #2).
 * Uses update() for field-level updates (enforcement rule #4).
 * Uses FieldValue.serverTimestamp() for updatedAt (enforcement rule #12).
 *
 * @param podcastId - The podcast document ID
 * @param data - Partial podcast data to update
 * @throws ZodError if input data fails validation
 */
export async function updatePodcastAdmin(
  podcastId: string,
  data: PodcastUpdate
): Promise<void> {
  // Validate BEFORE persisting (enforcement rule #2)
  const validated = PodcastUpdateSchema.parse(data)

  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId)

  try {
    await docRef.update({
      ...validated,
      updatedAt: FieldValue.serverTimestamp(),
    })

    log('INFO', 'Podcast updated (admin)', { podcastId, fields: Object.keys(validated) })
  } catch (error) {
    log('ERROR', 'Failed to update podcast (admin)', { podcastId, error })
    throw error
  }
}
