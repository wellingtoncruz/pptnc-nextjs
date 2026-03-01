/**
 * Newsletter Admin — per-video newsletter data operations.
 *
 * - `getNewsletterData()`: Reads `newsletter` field from video document.
 * - `saveNewsletterData()`: Updates `newsletter` field with server timestamp.
 *
 * Path: `podcasts/{podcastId}/videos/{videoId}` → field `newsletter`
 *
 * @see NewsletterDataSchema for validation rules
 */
import { FieldValue } from 'firebase-admin/firestore'

import { log } from '@/lib/logger'
import { NewsletterDataSchema, NewsletterDataCreateSchema } from '@/lib/schemas'
import type { NewsletterData, NewsletterDataCreate } from '@/types/newsletter'

import { getVideoDocRef } from './video-doc-ref'

/**
 * Gets newsletter data from a video document.
 *
 * Reads the `newsletter` field and validates with Zod.
 * Returns null if the document doesn't exist, has no newsletter field, or data is invalid.
 */
export async function getNewsletterData(videoId: string): Promise<NewsletterData | null> {
  const docRef = getVideoDocRef(videoId)
  const snapshot = await docRef.get()

  if (!snapshot.exists) {
    log('INFO', 'Newsletter data fetched', { videoId, found: false })
    return null
  }

  const data = snapshot.data()
  const rawNewsletter = data?.newsletter

  if (!rawNewsletter) {
    log('INFO', 'Newsletter data fetched', { videoId, found: false })
    return null
  }

  const parsed = NewsletterDataSchema.safeParse(rawNewsletter)
  if (!parsed.success) {
    log('WARN', 'Invalid newsletter data skipped', {
      videoId,
      issues: parsed.error.issues,
    })
    return null
  }

  log('INFO', 'Newsletter data fetched', { videoId, found: true })
  return parsed.data
}

/**
 * Saves newsletter data to a video document using atomic dot-notation updates.
 *
 * Uses Firestore dot-notation (`newsletter.field`) for each field,
 * avoiding read-modify-write race conditions with concurrent operations (e.g. auto-save).
 *
 * @param clearFields - Optional list of fields to delete (for invalidation chains)
 */
export async function saveNewsletterData(
  videoId: string,
  data: NewsletterDataCreate,
  clearFields?: string[]
): Promise<void> {
  const validated = NewsletterDataCreateSchema.parse(data)

  // Strip undefined values — Firestore rejects them
  const clean = Object.fromEntries(
    Object.entries(validated).filter(([, v]) => v !== undefined)
  )

  const docRef = getVideoDocRef(videoId)

  // Build atomic dot-notation update (no full-field replace)
  const update: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(clean)) {
    update[`newsletter.${key}`] = value
  }

  // Delete downstream fields during invalidation
  if (clearFields) {
    for (const field of clearFields) {
      if (!(field in clean)) {
        update[`newsletter.${field}`] = FieldValue.delete()
      }
    }
  }

  update['newsletter.generatedAt'] = FieldValue.serverTimestamp()

  await docRef.update(update)

  log('INFO', 'Newsletter data saved', { videoId })
}

/**
 * Patches specific newsletter fields using Firestore dot-notation.
 *
 * Unlike saveNewsletterData (which replaces the entire newsletter object),
 * this function updates only the specified fields. Does NOT reset generatedAt.
 * Safe for concurrent use (auto-save edits won't overwrite generation results).
 */
export async function patchNewsletterFields(
  videoId: string,
  fields: Record<string, string>
): Promise<void> {
  const docRef = getVideoDocRef(videoId)

  const update: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    update[`newsletter.${key}`] = value
  }

  await docRef.update(update)
  log('INFO', 'Newsletter fields patched', { videoId, fields: Object.keys(fields) })
}
