/**
 * Podcast Firestore operations using Client SDK.
 *
 * Use these functions in Client Components for reading podcast data.
 * For write operations in Route Handlers, use podcasts-admin.ts instead.
 *
 * @see architecture-iara.md#Data Architecture
 * @see project-context-iara.md#Enforcement Rules
 */

import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ZodError } from 'zod'

import { PodcastSchema, PodcastUpdateSchema } from '@/lib/schemas'
import { log } from '@/lib/logger'
import type { Podcast, PodcastUpdate } from '@/types/podcast'

import { getDb } from './client'

/**
 * Gets a podcast document by ID.
 *
 * @param podcastId - The podcast document ID
 * @returns The validated podcast document or null if not found
 * @throws ZodError if document data fails validation
 */
export async function getPodcast(podcastId: string): Promise<Podcast | null> {
  const db = getDb()
  const docRef = doc(db, 'podcasts', podcastId)

  try {
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      log('INFO', 'Podcast not found', { podcastId })
      return null
    }

    const data = { id: docSnap.id, ...docSnap.data() }
    return PodcastSchema.parse(data)
  } catch (error) {
    if (error instanceof ZodError) {
      log('ERROR', 'Podcast data validation failed', { podcastId, issues: error.issues })
    } else {
      log('ERROR', 'Failed to get podcast', { podcastId, error })
    }
    throw error
  }
}

/**
 * Updates a podcast document with field-level merge.
 *
 * Validates input with Zod BEFORE persisting (enforcement rule #2).
 * Uses updateDoc for field-level updates (enforcement rule #4).
 * Automatically updates `updatedAt` timestamp.
 *
 * @param podcastId - The podcast document ID
 * @param data - Partial podcast data to update
 * @throws ZodError if input data fails validation
 */
export async function updatePodcast(
  podcastId: string,
  data: PodcastUpdate
): Promise<void> {
  // Validate BEFORE persisting (enforcement rule #2)
  const validated = PodcastUpdateSchema.parse(data)

  const db = getDb()
  const docRef = doc(db, 'podcasts', podcastId)

  try {
    await updateDoc(docRef, {
      ...validated,
      updatedAt: serverTimestamp(),
    })

    log('INFO', 'Podcast updated', { podcastId, fields: Object.keys(validated) })
  } catch (error) {
    log('ERROR', 'Failed to update podcast', { podcastId, error })
    throw error
  }
}
