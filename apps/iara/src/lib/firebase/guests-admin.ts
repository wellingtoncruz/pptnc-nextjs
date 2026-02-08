/**
 * Guest Firestore operations using Admin SDK.
 *
 * Manages the `podcasts/{podcastId}/guests/{docId}` subcollection
 * for storing enriched LinkedIn profile data from BrightData scraping.
 *
 * CRITICAL: Never expose admin SDK to the client.
 * CRITICAL: All queries include podcastId (enforcement rule #8).
 *
 * @see architecture-iara.md#Data Architecture
 */

import { FieldValue } from 'firebase-admin/firestore'
import { Timestamp } from 'firebase-admin/firestore'

import { GuestDocCreateSchema } from '@/lib/schemas/guest'
import { log } from '@/lib/logger'
import type { GuestDoc, GuestDocCreate } from '@/types/guest'

import { getAdminDb } from './admin'

/**
 * Gets the guests collection reference for a podcast.
 * Path: podcasts/{podcastId}/guests
 */
function getGuestsCollection(podcastId: string) {
  const db = getAdminDb()
  return db.collection('podcasts').doc(podcastId).collection('guests')
}

/**
 * Finds a guest document by LinkedIn URL.
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param linkedinUrl - The LinkedIn profile URL to search for
 * @returns The guest document with its ID, or null if not found
 */
export async function getGuestByLinkedInUrl(
  podcastId: string,
  linkedinUrl: string
): Promise<(GuestDoc & { id: string }) | null> {
  const guestsRef = getGuestsCollection(podcastId)

  try {
    const snapshot = await guestsRef.where('url', '==', linkedinUrl).limit(1).get()

    if (snapshot.empty) {
      log('INFO', 'Guest not found by LinkedIn URL', { podcastId, linkedinUrl })
      return null
    }

    const docSnap = snapshot.docs[0]
    return { id: docSnap.id, ...docSnap.data() } as GuestDoc & { id: string }
  } catch (error) {
    log('ERROR', 'Failed to get guest by LinkedIn URL', { podcastId, linkedinUrl, error })
    throw error
  }
}

/**
 * Creates or updates a guest document (upsert by LinkedIn URL).
 *
 * - If guest with same URL exists: updates all fields + updatedAt
 * - If guest does not exist: creates new document with createdAt + updatedAt
 *
 * Validates input with Zod BEFORE persisting (enforcement rule #2).
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param data - Guest data to upsert
 * @returns The document ID of the created/updated guest
 */
export async function upsertGuest(
  podcastId: string,
  data: GuestDocCreate
): Promise<string> {
  // Validate BEFORE persisting (enforcement rule #2)
  const validated = GuestDocCreateSchema.parse(data)

  // Strip undefined values — Firestore rejects them
  const cleanData = Object.fromEntries(
    Object.entries(validated).filter(([, v]) => v !== undefined)
  )

  const guestsRef = getGuestsCollection(podcastId)

  try {
    // Check if guest already exists by LinkedIn URL
    const existing = await getGuestByLinkedInUrl(podcastId, validated.url)

    if (existing) {
      // UPDATE: Guest exists — update fields + updatedAt
      const docRef = guestsRef.doc(existing.id)
      await docRef.update({
        ...cleanData,
        scrapedAt: Timestamp.now(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      log('INFO', 'Guest updated', { podcastId, guestId: existing.id, url: validated.url })
      return existing.id
    } else {
      // CREATE: New guest — set all fields + timestamps
      const docRef = guestsRef.doc()
      await docRef.set({
        ...cleanData,
        scrapedAt: Timestamp.now(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      log('INFO', 'Guest created', { podcastId, guestId: docRef.id, url: validated.url })
      return docRef.id
    }
  } catch (error) {
    log('ERROR', 'Failed to upsert guest', { podcastId, url: validated.url, error })
    throw error
  }
}

/**
 * Lists all guests for a podcast.
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @returns Array of guest documents with their IDs
 */
export async function getGuestsByPodcast(
  podcastId: string
): Promise<Array<GuestDoc & { id: string }>> {
  const guestsRef = getGuestsCollection(podcastId)

  try {
    const snapshot = await guestsRef.get()

    if (snapshot.empty) {
      log('INFO', 'No guests found for podcast', { podcastId })
      return []
    }

    const guests = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as Array<GuestDoc & { id: string }>

    log('INFO', 'Guests fetched for podcast', { podcastId, count: guests.length })
    return guests
  } catch (error) {
    log('ERROR', 'Failed to get guests for podcast', { podcastId, error })
    throw error
  }
}
