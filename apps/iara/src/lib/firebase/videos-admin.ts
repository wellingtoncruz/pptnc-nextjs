/**
 * Video Firestore operations using Admin SDK.
 *
 * Use these functions in Route Handlers and Server Components.
 * For client-side reads, use videos.ts instead.
 *
 * CRITICAL: Never expose admin SDK to the client.
 * CRITICAL: All queries include podcastId (enforcement rule #8).
 *
 * REGRA IMUTÁVEL: O schema de videos NUNCA pode ser incompatível com
 * EpisodeEntity do portal-web (packages/types/src/episode.ts).
 *
 * @see architecture-iara.md#Data Architecture
 */

import { FieldValue } from 'firebase-admin/firestore'
import type { DocumentData } from 'firebase-admin/firestore'
import { ZodError } from 'zod'

import { VideoSchema, VideoCreateSchema, VideoUpdateSchema } from '@/lib/schemas/video'
import { log } from '@/lib/logger'
import { needsIaraFields } from '@/lib/video-utils'
import type { Video, VideoCreate, VideoUpdate, VideoSummary } from '@/types/video'

import { getAdminDb } from './admin'

/**
 * Maximum operations per Firestore batch.
 */
const MAX_BATCH_SIZE = 500

/**
 * Options for listing videos.
 */
export interface GetVideosByPodcastAdminOptions {
  /** Include soft-deleted videos (default: true for sync comparison) */
  includeDeleted?: boolean
}

/**
 * Options for paginated video listing.
 */
export interface GetVideosForDisplayOptions {
  /** Include soft-deleted videos (default: false) */
  includeDeleted?: boolean
  /** Page number (1-indexed, default: 1) */
  page?: number
  /** Number of videos per page (default: 20) */
  limit?: number
  /** Filter by video type (undefined means all) */
  videoType?: 'episode' | 'cut' | 'reel'
}

/**
 * Result of paginated video listing.
 */
export interface PaginatedVideosResult {
  /** Videos for the current page */
  data: VideoSummary[]
  /** Pagination metadata */
  pagination: {
    page: number
    limit: number
    totalCount: number
    totalPages: number
  }
}

/**
 * Batch operation types for batchWriteVideos.
 */
export interface BatchWriteOperations {
  /** Videos to create */
  creates: VideoCreate[]
  /** Videos to update (id + partial data) */
  updates: Array<{ id: string; data: VideoUpdate }>
  /** Video IDs to soft delete */
  deletes: string[]
}

/**
 * Gets all videos for a podcast (admin context).
 *
 * Uses FLAT schema structure compatible with portal-web/EpisodeEntity.
 * Does NOT use orderBy('createdAt') to support documents without this field.
 * Sorts in memory using publishedAt.
 *
 * Note: Includes deleted videos by default for sync comparison.
 * Path: podcasts/{podcastId}/videos
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param options - Optional query options
 * @returns Array of validated video documents
 */
export async function getVideosByPodcastAdmin(
  podcastId: string,
  options: GetVideosByPodcastAdminOptions = {}
): Promise<Video[]> {
  const { includeDeleted = true } = options
  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  try {
    // Fetch all documents and sort in memory
    const snapshot = await videosRef.get()

    if (snapshot.empty) {
      log('INFO', 'No videos found for podcast (admin)', { podcastId, includeDeleted })
      return []
    }

    const videos: Video[] = []
    let skippedCount = 0

    for (const docSnap of snapshot.docs) {
      const rawData = docSnap.data()
      const data = { id: docSnap.id, ...rawData } as Record<string, unknown>

      // Filter deleted if needed
      if (!includeDeleted && data.deleted === true) {
        continue
      }

      // Validate with flat schema
      const parsed = VideoSchema.safeParse(data)
      if (parsed.success) {
        videos.push(parsed.data)
      } else {
        skippedCount++
        log('WARN', 'Video validation failed, skipping', {
          podcastId,
          videoId: docSnap.id,
          issues: parsed.error.issues,
        })
      }
    }

    // Sort by publishedAt descending (flat field)
    videos.sort((a, b) => {
      const aDate = a.publishedAt?.toDate?.() ?? new Date(0)
      const bDate = b.publishedAt?.toDate?.() ?? new Date(0)
      return bDate.getTime() - aDate.getTime()
    })

    log('INFO', 'Videos fetched for podcast (admin)', {
      podcastId,
      count: videos.length,
      skipped: skippedCount,
      includeDeleted,
    })
    return videos
  } catch (error) {
    log('ERROR', 'Failed to get videos for podcast (admin)', { podcastId, error })
    throw error
  }
}

/**
 * Gets videos for display with pagination and filtering.
 *
 * Returns VideoSummary objects suitable for list display.
 * Documents without IAra fields get default values.
 * Supports pagination and filtering by video type.
 *
 * @param podcastId - The podcast document ID
 * @param options - Optional query options including pagination and filtering
 * @returns Paginated result with videos and metadata
 */
export async function getVideosForDisplayAdmin(
  podcastId: string,
  options: GetVideosForDisplayOptions = {}
): Promise<PaginatedVideosResult> {
  const { includeDeleted = false, page = 1, limit = 20, videoType } = options
  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  try {
    const snapshot = await videosRef.get()

    if (snapshot.empty) {
      log('INFO', 'No videos found for display (admin)', { podcastId, includeDeleted })
      return {
        data: [],
        pagination: { page, limit, totalCount: 0, totalPages: 0 },
      }
    }

    const videos: Array<VideoSummary & { _publishedAt: Date }> = []

    for (const docSnap of snapshot.docs) {
      const rawData = docSnap.data()

      // Filter deleted if needed
      const isDeleted = rawData.deleted === true
      if (!includeDeleted && isDeleted) {
        continue
      }

      const docVideoType = rawData.videoType ?? 'cut'

      // Filter by video type if specified
      if (videoType && docVideoType !== videoType) {
        continue
      }

      // Parse publishedAt - handle both Firestore Timestamp and ISO 8601 string
      let publishedAtDate: Date
      if (rawData.publishedAt?.toDate) {
        // Firestore Timestamp
        publishedAtDate = rawData.publishedAt.toDate()
      } else if (rawData.publishedAt) {
        // ISO 8601 string
        publishedAtDate = new Date(rawData.publishedAt)
      } else {
        publishedAtDate = new Date(0)
      }

      // Create summary with default values for missing fields
      const summary = {
        id: docSnap.id,
        title: rawData.title ?? 'Sem título',
        thumbnails: rawData.thumbnails,
        duration: rawData.duration ?? 0,
        status: rawData.status ?? 'new',
        videoType: docVideoType,
        _publishedAt: publishedAtDate,
      }
      videos.push(summary)
    }

    // Sort by publishedAt descending
    videos.sort((a, b) => b._publishedAt.getTime() - a._publishedAt.getTime())

    // Calculate pagination
    const totalCount = videos.length
    const totalPages = Math.ceil(totalCount / limit)
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit

    // Slice for current page and remove internal _publishedAt field
    const paginatedVideos: VideoSummary[] = videos.slice(startIndex, endIndex).map(({ _publishedAt, ...v }) => v)

    log('INFO', 'Videos fetched for display (admin)', {
      podcastId,
      page,
      limit,
      videoType: videoType ?? 'all',
      totalCount,
      returnedCount: paginatedVideos.length,
      includeDeleted,
    })

    return {
      data: paginatedVideos,
      pagination: { page, limit, totalCount, totalPages },
    }
  } catch (error) {
    log('ERROR', 'Failed to get videos for display (admin)', { podcastId, error })
    throw error
  }
}

/**
 * Gets all videos for a podcast including legacy schema documents.
 *
 * Use this when you need to access ALL videos regardless of schema.
 * Returns raw document data - caller must handle both schemas.
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @returns Array of raw video documents with id
 */
export async function getAllVideosRaw(
  podcastId: string
): Promise<Array<{ id: string } & DocumentData>> {
  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  const snapshot = await videosRef.get()

  if (snapshot.empty) {
    return []
  }

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }))
}

/**
 * Checks if a video exists by ID.
 *
 * Use this for sync operations to detect existing videos
 * without depending on any specific schema fields.
 *
 * @param podcastId - The podcast document ID
 * @param videoId - The video document ID (YouTube video ID)
 * @returns true if document exists, false otherwise
 */
export async function videoExists(
  podcastId: string,
  videoId: string
): Promise<boolean> {
  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId).collection('videos').doc(videoId)

  const docSnap = await docRef.get()
  return docSnap.exists
}

/**
 * Gets a single video document by ID (admin context).
 *
 * Path: podcasts/{podcastId}/videos/{videoId}
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param videoId - The video document ID (YouTube video ID)
 * @returns The validated video document or null if not found
 * @throws ZodError if document data fails validation
 */
export async function getVideoAdmin(
  podcastId: string,
  videoId: string
): Promise<Video | null> {
  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId).collection('videos').doc(videoId)

  try {
    const docSnap = await docRef.get()

    if (!docSnap.exists) {
      log('INFO', 'Video not found (admin)', { podcastId, videoId })
      return null
    }

    const data = { id: docSnap.id, ...docSnap.data() }
    return VideoSchema.parse(data)
  } catch (error) {
    if (error instanceof ZodError) {
      log('ERROR', 'Video data validation failed (admin)', { podcastId, videoId, issues: error.issues })
    } else {
      log('ERROR', 'Failed to get video (admin)', { podcastId, videoId, error })
    }
    throw error
  }
}

/**
 * Creates a new video document (admin context).
 *
 * Validates input with Zod BEFORE persisting (enforcement rule #2).
 * Uses FieldValue.serverTimestamp() for timestamps (admin SDK).
 * Document ID is the YouTube videoId (natural key).
 *
 * @param data - Video data to create
 * @throws ZodError if input data fails validation
 */
export async function createVideoAdmin(data: VideoCreate): Promise<void> {
  // Validate BEFORE persisting (enforcement rule #2)
  const validated = VideoCreateSchema.parse(data)

  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(validated.podcastId).collection('videos').doc(validated.id)

  try {
    await docRef.set({
      ...validated,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    log('INFO', 'Video created (admin)', { podcastId: validated.podcastId, videoId: validated.id })
  } catch (error) {
    log('ERROR', 'Failed to create video (admin)', {
      podcastId: validated.podcastId,
      videoId: validated.id,
      error,
    })
    throw error
  }
}

/**
 * Updates a video document with field-level merge (admin context).
 *
 * Validates input with Zod BEFORE persisting (enforcement rule #2).
 * Uses update() for field-level updates (enforcement rule #4).
 * Uses FieldValue.serverTimestamp() for updatedAt (enforcement rule #12).
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param videoId - The video document ID
 * @param data - Partial video data to update
 * @throws ZodError if input data fails validation
 */
export async function updateVideoAdmin(
  podcastId: string,
  videoId: string,
  data: VideoUpdate
): Promise<void> {
  // Validate BEFORE persisting (enforcement rule #2)
  const validated = VideoUpdateSchema.parse(data)

  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId).collection('videos').doc(videoId)

  try {
    await docRef.update({
      ...validated,
      updatedAt: FieldValue.serverTimestamp(),
    })

    log('INFO', 'Video updated (admin)', { podcastId, videoId, fields: Object.keys(validated) })
  } catch (error) {
    log('ERROR', 'Failed to update video (admin)', { podcastId, videoId, error })
    throw error
  }
}

/**
 * Soft deletes a video by setting deleted flag to true (admin context).
 *
 * Does NOT physically delete the document (soft delete pattern).
 * Uses update() for field-level updates (enforcement rule #4).
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param videoId - The video document ID
 */
export async function softDeleteVideoAdmin(
  podcastId: string,
  videoId: string
): Promise<void> {
  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId).collection('videos').doc(videoId)

  try {
    await docRef.update({
      deleted: true,
      updatedAt: FieldValue.serverTimestamp(),
    })

    log('INFO', 'Video soft deleted (admin)', { podcastId, videoId })
  } catch (error) {
    log('ERROR', 'Failed to soft delete video (admin)', { podcastId, videoId, error })
    throw error
  }
}

/**
 * Executes batch write operations for videos.
 *
 * Handles creates, updates, and soft deletes in batches.
 * Splits into multiple batches if total operations exceed 500 (Firestore limit).
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param operations - Batch operations to execute
 */
export async function batchWriteVideos(
  podcastId: string,
  operations: BatchWriteOperations
): Promise<void> {
  const { creates, updates, deletes } = operations
  const db = getAdminDb()

  // Calculate total operations
  const totalOps = creates.length + updates.length + deletes.length

  if (totalOps === 0) {
    log('INFO', 'Batch write with no operations', { podcastId })
    // Commit empty batch for consistency
    const batch = db.batch()
    await batch.commit()
    return
  }

  log('INFO', 'Starting batch write', {
    podcastId,
    creates: creates.length,
    updates: updates.length,
    deletes: deletes.length,
    totalOps,
  })

  // Collect all operations
  const allOperations: Array<{
    type: 'create' | 'update' | 'delete'
    videoId: string
    data?: VideoCreate | VideoUpdate
  }> = []

  // Add creates
  for (const createData of creates) {
    // Validate each create (enforcement rule #2)
    VideoCreateSchema.parse(createData)
    allOperations.push({ type: 'create', videoId: createData.id, data: createData })
  }

  // Add updates
  for (const { id, data } of updates) {
    // Validate each update (enforcement rule #2)
    VideoUpdateSchema.parse(data)
    allOperations.push({ type: 'update', videoId: id, data })
  }

  // Add deletes
  for (const videoId of deletes) {
    allOperations.push({ type: 'delete', videoId })
  }

  // Process in batches of MAX_BATCH_SIZE
  const batches: Array<typeof allOperations> = []
  for (let i = 0; i < allOperations.length; i += MAX_BATCH_SIZE) {
    batches.push(allOperations.slice(i, i + MAX_BATCH_SIZE))
  }

  log('INFO', 'Batch write split into batches', { podcastId, batchCount: batches.length })

  // Execute each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batchOps = batches[batchIndex]
    const batch = db.batch()
    const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

    for (const op of batchOps) {
      const docRef = videosRef.doc(op.videoId)

      if (op.type === 'create' && op.data) {
        batch.set(docRef, {
          ...op.data,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      } else if (op.type === 'update' && op.data) {
        batch.update(docRef, {
          ...op.data,
          updatedAt: FieldValue.serverTimestamp(),
        })
      } else if (op.type === 'delete') {
        batch.update(docRef, {
          deleted: true,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    await batch.commit()
    log('INFO', 'Batch committed', { podcastId, batchIndex: batchIndex + 1, opsCount: batchOps.length })
  }

  log('INFO', 'Batch write completed', { podcastId, totalOps })
}
