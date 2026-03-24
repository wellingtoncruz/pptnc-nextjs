/**
 * Scheduled Posts Firestore operations using Admin SDK.
 *
 * Collection: podcasts/{podcastId}/scheduled-posts/{postId}
 *
 * CRUD operations for social media publication scheduling.
 * Supports filtering by status, sourceType, and network.
 * Cursor-based pagination ordered by scheduledAt.
 *
 * CRITICAL: Never expose admin SDK to the client.
 * CRITICAL: All queries include podcastId (enforcement rule #8).
 */

import { FieldValue, Timestamp } from 'firebase-admin/firestore'

import { log } from '@/lib/logger'
import {
  ScheduledPostCreateSchema,
  ScheduledPostSchema,
  ScheduledPostUpdateSchema,
} from '@/lib/schemas/scheduled-post'
import type { ScheduledPost, ScheduledPostStatus } from '@/types/scheduled-post'

import { getAdminDb } from './admin'

/**
 * Options for listing scheduled posts.
 */
export interface ListScheduledPostsOptions {
  /** Filter by status */
  status?: ScheduledPostStatus | ScheduledPostStatus[]
  /** Filter by source type (news, video, newsletter) */
  sourceType?: string
  /** Filter by network (linkedin, twitter, etc.) */
  network?: string
  /** Exclude dismissed posts (default: true) */
  excludeDismissed?: boolean
  /** Cursor for pagination — ISO string of the last item's scheduledAt */
  cursor?: string
  /** Max items to return (default 20, max 50) */
  limit?: number
}

/**
 * Result from listing scheduled posts.
 */
export interface ListScheduledPostsResult {
  items: ScheduledPost[]
  /** ISO string cursor for next page, or null if no more pages */
  nextCursor: string | null
  /** Total count matching filters (excluding pagination) */
  totalCount: number
}

/**
 * Gets the scheduled-posts subcollection reference for a podcast.
 */
function getCollection(podcastId: string) {
  const db = getAdminDb()
  return db.collection('podcasts').doc(podcastId).collection('scheduled-posts')
}

/**
 * Creates a scheduled post document in Firestore.
 *
 * @param podcastId - The podcast ID
 * @param data - Validated creation data
 * @returns The created document ID
 */
export async function createScheduledPost(
  podcastId: string,
  data: unknown
): Promise<string> {
  const validated = ScheduledPostCreateSchema.parse(data)

  const colRef = getCollection(podcastId)
  const docRef = colRef.doc()

  const scheduledAt = Timestamp.fromDate(new Date(validated.scheduledAt))

  await docRef.set({
    sourceType: validated.sourceType,
    sourceId: validated.sourceId,
    content: validated.content,
    ...(validated.firstComment && { firstComment: validated.firstComment }),
    ...(validated.imageUrl && { imageUrl: validated.imageUrl }),
    network: validated.network,
    networkConfig: validated.networkConfig,
    scheduledAt,
    scheduledBy: validated.scheduledBy,
    status: 'scheduled',
    dismissed: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  log('INFO', 'Scheduled post created', {
    podcastId,
    postId: docRef.id,
    network: validated.network,
    sourceType: validated.sourceType,
    scheduledAt: validated.scheduledAt,
  })

  return docRef.id
}

/**
 * Gets a single scheduled post by ID.
 *
 * @param podcastId - The podcast ID
 * @param postId - The scheduled post ID
 * @returns The scheduled post or null if not found
 */
export async function getScheduledPost(
  podcastId: string,
  postId: string
): Promise<ScheduledPost | null> {
  const docRef = getCollection(podcastId).doc(postId)
  const snapshot = await docRef.get()

  if (!snapshot.exists) {
    return null
  }

  const parsed = ScheduledPostSchema.safeParse({
    id: snapshot.id,
    ...snapshot.data(),
  })

  if (!parsed.success) {
    log('WARN', 'Scheduled post validation failed on read', {
      podcastId,
      postId,
      errors: parsed.error.issues,
    })
    return null
  }

  return parsed.data
}

/**
 * Lists scheduled posts with filtering and cursor-based pagination.
 *
 * Ordered by scheduledAt ASC (upcoming first) for pending posts,
 * showing the most imminent schedules at the top.
 *
 * @param podcastId - The podcast ID
 * @param options - Filter and pagination options
 * @returns Paginated list of scheduled posts
 */
export async function listScheduledPosts(
  podcastId: string,
  options: ListScheduledPostsOptions = {}
): Promise<ListScheduledPostsResult> {
  const limit = Math.min(options.limit ?? 20, 50)
  const excludeDismissed = options.excludeDismissed ?? true

  const colRef = getCollection(podcastId)

  // Firestore requires equality filters before orderBy for composite indexes.
  // We apply in-memory filtering for multi-value status and dismissed to avoid
  // requiring a composite index for every combination.
  let query = colRef.orderBy('scheduledAt', 'asc')

  // Single status filter can use Firestore where clause
  if (options.status && !Array.isArray(options.status)) {
    query = query.where('status', '==', options.status)
  }

  if (options.sourceType) {
    query = query.where('sourceType', '==', options.sourceType)
  }

  if (options.network) {
    query = query.where('network', '==', options.network)
  }

  if (options.cursor) {
    const cursorDate = new Date(options.cursor)
    const cursorTimestamp = Timestamp.fromDate(cursorDate)
    query = query.startAfter(cursorTimestamp)
  }

  // Fetch extra to account for in-memory filtering
  const fetchLimit = excludeDismissed || Array.isArray(options.status) ? limit * 3 : limit
  query = query.limit(fetchLimit)

  const snapshot = await query.get()

  let items: ScheduledPost[] = []
  for (const doc of snapshot.docs) {
    const parsed = ScheduledPostSchema.safeParse({
      id: doc.id,
      ...doc.data(),
    })
    if (parsed.success) {
      items.push(parsed.data)
    }
  }

  // In-memory filters
  if (excludeDismissed) {
    items = items.filter((item) => !item.dismissed)
  }

  if (Array.isArray(options.status)) {
    const statusSet = new Set(options.status)
    items = items.filter((item) => statusSet.has(item.status))
  }

  // Apply pagination limit after filtering
  const hasMore = items.length > limit
  const paginatedItems = items.slice(0, limit)

  const lastItem = paginatedItems[paginatedItems.length - 1]
  const nextCursor = hasMore && lastItem
    ? lastItem.scheduledAt.toDate().toISOString()
    : null

  // Count query (matching filters)
  const countQuery = excludeDismissed
    ? colRef.where('dismissed', '==', false)
    : colRef
  const countSnapshot = await countQuery.count().get()
  const totalCount = countSnapshot.data().count

  return { items: paginatedItems, nextCursor, totalCount }
}

/**
 * Updates a scheduled post with partial data.
 *
 * @param podcastId - The podcast ID
 * @param postId - The scheduled post ID
 * @param data - Fields to update
 */
export async function updateScheduledPost(
  podcastId: string,
  postId: string,
  data: unknown
): Promise<void> {
  const validated = ScheduledPostUpdateSchema.parse(data)

  const docRef = getCollection(podcastId).doc(postId)

  await docRef.update({
    ...validated,
    updatedAt: FieldValue.serverTimestamp(),
  })

  log('INFO', 'Scheduled post updated', {
    podcastId,
    postId,
    fields: Object.keys(validated),
  })
}

/**
 * Counts pending scheduled posts (scheduled + publishing).
 * Used for sidebar badge.
 *
 * @param podcastId - The podcast ID
 * @returns Count of pending posts
 */
export async function countPendingScheduledPosts(
  podcastId: string
): Promise<number> {
  const colRef = getCollection(podcastId)

  const [scheduledCount, publishingCount] = await Promise.all([
    colRef.where('status', '==', 'scheduled').where('dismissed', '==', false).count().get(),
    colRef.where('status', '==', 'publishing').where('dismissed', '==', false).count().get(),
  ])

  return scheduledCount.data().count + publishingCount.data().count
}

/**
 * Finds scheduled posts by source (e.g., all posts for a specific news item).
 *
 * @param podcastId - The podcast ID
 * @param sourceId - The source document ID
 * @param network - Optional network filter
 * @returns Matching scheduled posts (non-dismissed)
 */
export async function findScheduledPostsBySource(
  podcastId: string,
  sourceId: string,
  network?: string
): Promise<ScheduledPost[]> {
  const colRef = getCollection(podcastId)

  let query = colRef
    .where('sourceId', '==', sourceId)
    .where('dismissed', '==', false)

  if (network) {
    query = query.where('network', '==', network)
  }

  const snapshot = await query.get()

  const items: ScheduledPost[] = []
  for (const doc of snapshot.docs) {
    const parsed = ScheduledPostSchema.safeParse({
      id: doc.id,
      ...doc.data(),
    })
    if (parsed.success) {
      items.push(parsed.data)
    }
  }

  return items
}
