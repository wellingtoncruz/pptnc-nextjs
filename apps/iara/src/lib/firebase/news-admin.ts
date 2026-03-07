/**
 * News Firestore operations using Admin SDK.
 *
 * The news collection is populated by an external pipeline job.
 * Write operations limited to embedding/related_videos (Epic 18).
 * Use these functions in Route Handlers and Server Components.
 *
 * CRITICAL: Never expose admin SDK to the client.
 * CRITICAL: All queries include podcastId (enforcement rule #8).
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore'

import { NewsSchema } from '@/lib/schemas/news'
import { log } from '@/lib/logger'
import type { News } from '@/types/news'

import { getAdminDb } from './admin'

/**
 * Options for listing news.
 */
interface ListNewsOptions {
  /** Cursor for pagination — ISO string of the last item's importedAt */
  cursor?: string
  /** Max items to return (default 16, max 50) */
  limit?: number
}

/**
 * Result from listing news.
 */
interface ListNewsResult {
  items: News[]
  /** ISO string cursor for next page, or null if no more pages */
  nextCursor: string | null
  /** Total number of documents in the collection */
  totalCount: number
}

/**
 * Lists news from Firestore with cursor-based pagination.
 *
 * Uses `importedAt` DESC ordering with Firestore `startAfter` for efficient
 * server-side pagination (no offset, no full collection scan).
 *
 * @param podcastId - The podcast ID
 * @param options - Pagination options
 * @returns Paginated news items with next cursor
 */
export async function listNews(
  podcastId: string,
  options: ListNewsOptions = {}
): Promise<ListNewsResult> {
  const limit = Math.min(options.limit ?? 16, 50)
  const db = getAdminDb()

  let query = db
    .collection('podcasts')
    .doc(podcastId)
    .collection('news')
    .orderBy('importedAt', 'desc')

  if (options.cursor) {
    const cursorDate = new Date(options.cursor)
    const cursorTimestamp = Timestamp.fromDate(cursorDate)
    query = query.startAfter(cursorTimestamp)
  }

  query = query.limit(limit)

  const newsRef = db.collection('podcasts').doc(podcastId).collection('news')

  // Run list + count in parallel
  const [snapshot, countSnapshot] = await Promise.all([
    query.get(),
    newsRef.count().get(),
  ])

  const totalCount = countSnapshot.data().count

  const items: News[] = []
  for (const doc of snapshot.docs) {
    const parsed = NewsSchema.safeParse({ id: doc.id, ...doc.data() })
    if (parsed.success) {
      items.push(parsed.data)
    } else {
      log('WARN', 'Invalid news document skipped', {
        newsId: doc.id,
        issues: parsed.error.issues,
      })
    }
  }

  // nextCursor based on last Firestore doc (not last validated item)
  // This ensures pagination works even if some docs fail validation
  let nextCursor: string | null = null
  if (snapshot.docs.length === limit) {
    const lastDoc = snapshot.docs[snapshot.docs.length - 1]
    const lastImportedAt = lastDoc.data().importedAt
    if (lastImportedAt && typeof lastImportedAt.toDate === 'function') {
      nextCursor = lastImportedAt.toDate().toISOString()
    }
  }

  log('INFO', 'News listed', {
    podcastId,
    count: items.length,
    hasCursor: !!options.cursor,
    hasNextPage: !!nextCursor,
  })

  return { items, nextCursor, totalCount }
}

/**
 * Lists all news within a date range by `importedAt` timestamp.
 *
 * Used by the newsletter workflow to fetch recent news (last 48h).
 * No pagination — returns every document whose `importedAt`
 * falls within [rangeStart, rangeEnd].
 *
 * @param podcastId - The podcast ID
 * @param rangeStart - Start of the range (inclusive)
 * @param rangeEnd - End of the range (inclusive)
 * @returns All validated news items in the range
 */
export async function listNewsByDate(
  podcastId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<News[]> {
  const db = getAdminDb()

  const startTimestamp = Timestamp.fromDate(rangeStart)
  const endTimestamp = Timestamp.fromDate(rangeEnd)

  const snapshot = await db
    .collection('podcasts')
    .doc(podcastId)
    .collection('news')
    .where('importedAt', '>=', startTimestamp)
    .where('importedAt', '<=', endTimestamp)
    .orderBy('importedAt', 'desc')
    .get()

  const items: News[] = []
  for (const doc of snapshot.docs) {
    const parsed = NewsSchema.safeParse({ id: doc.id, ...doc.data() })
    if (parsed.success) {
      items.push(parsed.data)
    } else {
      log('WARN', 'Invalid news document skipped', {
        newsId: doc.id,
        issues: parsed.error.issues,
      })
    }
  }

  log('INFO', 'News listed by date', {
    podcastId,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    count: items.length,
  })

  return items
}

// ==========================================================================
// Story 20.3 — Server-side news text search
// ==========================================================================

/**
 * Options for searching news.
 */
interface SearchNewsOptions {
  /** Max items to return (default 15, max 50) */
  limit?: number
  /** Cursor for pagination — ISO string of the last item's importedAt */
  cursor?: string
}

/**
 * Searches news by substring match on titulo and descricao (case-insensitive).
 *
 * Firestore does not support LIKE queries natively, so this loads documents
 * and filters in-memory on the server. Acceptable for small-to-medium collections.
 *
 * @param podcastId - The podcast ID
 * @param query - The search term
 * @param options - Pagination options
 * @returns Paginated search results
 */
export async function searchNews(
  podcastId: string,
  query: string,
  options: SearchNewsOptions = {}
): Promise<ListNewsResult> {
  const limit = Math.min(options.limit ?? 15, 50)
  const db = getAdminDb()

  // Load a larger batch to filter from (3x limit to ensure enough results)
  const batchSize = 200
  let firestoreQuery = db
    .collection('podcasts')
    .doc(podcastId)
    .collection('news')
    .orderBy('importedAt', 'desc')

  if (options.cursor) {
    const cursorDate = new Date(options.cursor)
    const cursorTimestamp = Timestamp.fromDate(cursorDate)
    firestoreQuery = firestoreQuery.startAfter(cursorTimestamp)
  }

  firestoreQuery = firestoreQuery.limit(batchSize)

  const snapshot = await firestoreQuery.get()

  const queryLower = query.toLowerCase()
  const matchedItems: News[] = []

  for (const doc of snapshot.docs) {
    const parsed = NewsSchema.safeParse({ id: doc.id, ...doc.data() })
    if (!parsed.success) continue

    const news = parsed.data
    const titulo = (news.titulo || '').toLowerCase()
    const descricao = (news.descricao || '').toLowerCase()

    if (titulo.includes(queryLower) || descricao.includes(queryLower)) {
      matchedItems.push(news)
    }
  }

  // Apply pagination over filtered results
  const paginatedItems = matchedItems.slice(0, limit)

  let nextCursor: string | null = null
  if (matchedItems.length > limit) {
    // More results exist — use the last returned item's importedAt as cursor
    const lastItem = paginatedItems[paginatedItems.length - 1]
    if (lastItem.importedAt && typeof lastItem.importedAt.toDate === 'function') {
      nextCursor = lastItem.importedAt.toDate().toISOString()
    }
  } else if (snapshot.docs.length === batchSize && matchedItems.length <= limit) {
    // We consumed the whole batch but there may be more docs — use last doc's importedAt
    const lastDoc = snapshot.docs[snapshot.docs.length - 1]
    const lastImportedAt = lastDoc.data().importedAt
    if (lastImportedAt && typeof lastImportedAt.toDate === 'function') {
      nextCursor = lastImportedAt.toDate().toISOString()
    }
  }

  log('INFO', 'News searched', {
    podcastId,
    query,
    matchCount: matchedItems.length,
    returnedCount: paginatedItems.length,
    hasNextPage: !!nextCursor,
  })

  return { items: paginatedItems, nextCursor, totalCount: matchedItems.length }
}

// ==========================================================================
// Story 18.3 — News embedding and related_videos
// ==========================================================================

/**
 * Reads the embedding vector from a news document.
 *
 * Firestore Vector fields return an object with `toArray()`.
 * Returns null if document or embedding field doesn't exist.
 *
 * @param podcastId - The podcast ID
 * @param newsId - The news document ID
 * @returns The embedding vector as number[], or null
 */
export async function getNewsEmbedding(
  podcastId: string,
  newsId: string
): Promise<number[] | null> {
  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId).collection('news').doc(newsId)
  const docSnap = await docRef.get()

  if (!docSnap.exists) return null

  const data = docSnap.data()
  const embedding = data?.embedding?.toArray?.() ?? null
  return embedding
}

/**
 * Persists an embedding vector on a news document.
 *
 * @param podcastId - The podcast ID
 * @param newsId - The news document ID
 * @param vector - The embedding vector (768 dimensions)
 */
export async function updateNewsEmbedding(
  podcastId: string,
  newsId: string,
  vector: number[]
): Promise<void> {
  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId).collection('news').doc(newsId)
  await docRef.update({
    embedding: FieldValue.vector(vector),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

/**
 * Persists the related_videos array on a news document.
 *
 * @param podcastId - The podcast ID
 * @param newsId - The news document ID
 * @param videoIds - Array of video document IDs
 */
export async function updateNewsRelatedVideos(
  podcastId: string,
  newsId: string,
  videoIds: string[]
): Promise<void> {
  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId).collection('news').doc(newsId)
  await docRef.update({
    related_videos: videoIds,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

/**
 * Updates specific fields on a news document with invalidation logic.
 *
 * If `selected_video` is changed to a different value, `social` is set to null (invalidation).
 * If only `social` is updated, no read is needed (direct update).
 *
 * @param podcastId - The podcast ID
 * @param newsId - The news document ID
 * @param data - Fields to update (selected_video and/or social)
 */
export async function updateNewsFields(
  podcastId: string,
  newsId: string,
  data: { selected_video?: string; social?: string | null }
): Promise<void> {
  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId).collection('news').doc(newsId)

  const updatePayload: Record<string, unknown> = {}

  if ('selected_video' in data) {
    updatePayload.selected_video = data.selected_video

    // Read current value to decide invalidation
    const currentDoc = await docRef.get()
    const currentSelected = currentDoc.data()?.selected_video
    if (data.selected_video !== currentSelected) {
      // Invalidation takes precedence over any social value in the same request
      updatePayload.social = null
    } else if ('social' in data) {
      // Same video, allow social update
      updatePayload.social = data.social
    }
  } else if ('social' in data) {
    updatePayload.social = data.social
  }

  updatePayload.updatedAt = FieldValue.serverTimestamp()
  await docRef.update(updatePayload)
}

/**
 * Updates image fields on a news document.
 *
 * Uses dot-notation update for atomicity (no read required).
 *
 * @param podcastId - The podcast ID
 * @param newsId - The news document ID
 * @param data - Image fields to update
 */
export async function updateNewsImageFields(
  podcastId: string,
  newsId: string,
  data: { imageUrl?: string | null; imagePrompt?: string | null }
): Promise<void> {
  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId).collection('news').doc(newsId)

  const updatePayload: Record<string, unknown> = {}
  if ('imageUrl' in data) updatePayload.imageUrl = data.imageUrl
  if ('imagePrompt' in data) updatePayload.imagePrompt = data.imagePrompt
  updatePayload.updatedAt = FieldValue.serverTimestamp()

  await docRef.update(updatePayload)
}

/**
 * Reads a single news document by ID.
 *
 * @param podcastId - The podcast ID
 * @param newsId - The news document ID
 * @returns The validated news document, or null if not found
 */
export async function getNewsById(
  podcastId: string,
  newsId: string
): Promise<News | null> {
  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId).collection('news').doc(newsId)
  const docSnap = await docRef.get()

  if (!docSnap.exists) return null

  const parsed = NewsSchema.safeParse({ id: docSnap.id, ...docSnap.data() })
  if (!parsed.success) {
    log('WARN', 'Invalid news document', {
      newsId: docSnap.id,
      issues: parsed.error.issues,
    })
    return null
  }
  return parsed.data
}
