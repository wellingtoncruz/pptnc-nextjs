/**
 * News Firestore operations using Admin SDK.
 *
 * Read-only — the news collection is populated by an external pipeline job.
 * Use these functions in Route Handlers and Server Components.
 *
 * CRITICAL: Never expose admin SDK to the client.
 * CRITICAL: All queries include podcastId (enforcement rule #8).
 */

import { Timestamp } from 'firebase-admin/firestore'

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
