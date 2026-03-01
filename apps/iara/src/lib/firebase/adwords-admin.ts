/**
 * AdWords Admin — per-video adwords data operations.
 *
 * - `getAdwordsData()`: Reads `adwords` field from video document.
 * - `saveAdwordsData()`: Updates `adwords` field with server timestamp.
 *
 * Path: `podcasts/{podcastId}/videos/{videoId}` → field `adwords`
 *
 * @see AdwordsDataSchema for validation rules
 */
import { FieldValue } from 'firebase-admin/firestore'

import { log } from '@/lib/logger'
import { AdwordsDataSchema, AdwordsDataCreateSchema } from '@/lib/schemas'
import type { AdwordsData, AdwordsDataCreate } from '@/types/adwords'

import { getVideoDocRef } from './video-doc-ref'

/**
 * Gets adwords data from a video document.
 *
 * Reads the `adwords` field from the video document and validates with Zod.
 * Returns null if the document doesn't exist, has no adwords field, or data is invalid.
 *
 * @param videoId - The video document ID
 * @returns Validated AdwordsData or null
 */
export async function getAdwordsData(videoId: string): Promise<AdwordsData | null> {
  const docRef = getVideoDocRef(videoId)
  const snapshot = await docRef.get()

  if (!snapshot.exists) {
    log('INFO', 'AdWords data fetched', { videoId, found: false })
    return null
  }

  const data = snapshot.data()
  const rawAdwords = data?.adwords

  if (!rawAdwords) {
    log('INFO', 'AdWords data fetched', { videoId, found: false })
    return null
  }

  const parsed = AdwordsDataSchema.safeParse(rawAdwords)
  if (!parsed.success) {
    log('WARN', 'Invalid adwords data skipped', {
      videoId,
      issues: parsed.error.issues,
    })
    return null
  }

  log('INFO', 'AdWords data fetched', { videoId, found: true })
  return parsed.data
}

/**
 * Saves adwords data to a video document.
 *
 * Updates the `adwords` field using field-level merge with server timestamp.
 *
 * @param videoId - The video document ID
 * @param data - The adwords data to save (guide, keywords, additionalContext?)
 */
export async function saveAdwordsData(
  videoId: string,
  data: AdwordsDataCreate
): Promise<void> {
  const validated = AdwordsDataCreateSchema.parse(data)

  const docRef = getVideoDocRef(videoId)

  const adwordsField: Record<string, unknown> = {
    guide: validated.guide,
    keywords: validated.keywords,
    generatedAt: FieldValue.serverTimestamp(),
  }

  if (validated.additionalContext !== undefined) {
    adwordsField.additionalContext = validated.additionalContext
  }

  await docRef.update({ adwords: adwordsField })

  log('INFO', 'AdWords data saved', { videoId })
}
