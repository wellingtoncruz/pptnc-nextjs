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
import type { DocumentData, Query } from 'firebase-admin/firestore'
import { ZodError } from 'zod'

import { VideoSchema, VideoCreateSchema, VideoUpdateSchema, VideoSummarySchema } from '@/lib/schemas/video'
import { log } from '@/lib/logger'
import { needsIaraFields } from '@/lib/video-utils'
import type { Video, VideoCreate, VideoUpdate, VideoSummary } from '@/types/video'

import { embedVideo } from '@/lib/embedding/video-embedding'
import { getAdminDb } from './admin'

/**
 * Maximum operations per Firestore batch.
 */
// Reduced from 500 to 20 to handle large documents with base64 thumbnails
const MAX_BATCH_SIZE = 20

/**
 * Parses a date value that can be either a Firestore Timestamp or ISO 8601 string.
 *
 * @param value - The date value to parse (Timestamp, string, or undefined)
 * @returns A valid Date object, or Date(0) if parsing fails
 */
function parsePublishedAt(value: unknown): Date {
  // Handle Firestore Timestamp
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }

  // Handle ISO 8601 string
  if (typeof value === 'string') {
    const date = new Date(value)
    // Check for Invalid Date
    if (!Number.isNaN(date.getTime())) {
      return date
    }
  }

  // Fallback for missing or invalid dates
  return new Date(0)
}

/**
 * Options for listing videos.
 */
export interface GetVideosByPodcastAdminOptions {
  // Reserved for future options
}

/**
 * Options for paginated video listing.
 */
export interface GetVideosForDisplayOptions {
  /** Page number (1-indexed, default: 1) */
  page?: number
  /** Number of videos per page (default: 20) */
  limit?: number
  /** Filter by video type (undefined means all) */
  videoType?: 'episode' | 'cut' | 'reel'
  /** Filter by video status (undefined means all, 'not_sent' means all except 'sent') */
  status?: 'new' | 'draft' | 'sent' | 'not_sent'
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
 * Path: podcasts/{podcastId}/videos
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param _options - Reserved for future options
 * @returns Array of validated video documents
 */
export async function getVideosByPodcastAdmin(
  podcastId: string,
  _options: GetVideosByPodcastAdminOptions = {}
): Promise<Video[]> {
  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  try {
    // Fetch all documents and sort in memory
    const snapshot = await videosRef.get()

    if (snapshot.empty) {
      log('INFO', 'No videos found for podcast (admin)', { podcastId })
      return []
    }

    const videos: Video[] = []
    let skippedCount = 0

    for (const docSnap of snapshot.docs) {
      const rawData = docSnap.data()
      const data = { id: docSnap.id, ...rawData } as Record<string, unknown>

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

    // Sort by publishedAt descending using helper for consistent parsing
    videos.sort((a, b) => {
      const aDate = parsePublishedAt(a.publishedAt)
      const bDate = parsePublishedAt(b.publishedAt)
      return bDate.getTime() - aDate.getTime()
    })

    log('INFO', 'Videos fetched for podcast (admin)', {
      podcastId,
      count: videos.length,
      skipped: skippedCount,
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
  const { page = 1, limit = 20, videoType, status } = options
  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  // Build query with Firestore-level filters
  // Note: Requires index on videoType field for efficient queries
  let query: Query<DocumentData> = videosRef

  // Filter by videoType at Firestore level if specified
  if (videoType) {
    query = query.where('videoType', '==', videoType)
  }

  // Filter by status at Firestore level if specified
  if (status === 'not_sent') {
    // Show all videos except 'sent' - for "Só novos" switch
    query = query.where('status', '!=', 'sent')
  } else if (status) {
    query = query.where('status', '==', status)
  }

  try {
    const snapshot = await query.get()

    if (snapshot.empty) {
      log('INFO', 'No videos found for display (admin)', { podcastId, videoType })
      return {
        data: [],
        pagination: { page, limit, totalCount: 0, totalPages: 0 },
      }
    }

    const videos: Array<VideoSummary & { _publishedAt: Date }> = []

    for (const docSnap of snapshot.docs) {
      const rawData = docSnap.data()
      const docVideoType = rawData.videoType ?? 'cut'

      // Double-check videoType for documents without the field
      if (videoType && docVideoType !== videoType) {
        continue
      }

      // Parse publishedAt using helper for consistent handling
      const publishedAtDate = parsePublishedAt(rawData.publishedAt)

      // Create summary with default values for missing fields
      const summary = {
        id: docSnap.id,
        title: rawData.title ?? 'Sem título',
        thumbnails: rawData.thumbnails,
        duration: rawData.duration ?? 0,
        status: rawData.status ?? 'new',
        videoType: docVideoType,
        transcriptionSRT: rawData.transcriptionSRT,
        transcriptionTXT: rawData.transcriptionTXT,
        // Context fields (flat, not nested)
        theme: rawData.theme,
        guests: rawData.guests,
        spotifyUrl: rawData.spotifyUrl,
        // AI-generated fields - needed for wizard phase detection
        critique: rawData.critique,
        editingIssues: rawData.editingIssues,
        riskAndCompliance: rawData.riskAndCompliance,
        chapters: rawData.chapters,
        suggestedTitles: rawData.suggestedTitles,
        description: rawData.description,
        tags: rawData.tags,
        reviewedPhases: rawData.reviewedPhases,
        // Timestamp fields for VideoMetadata display (fix.md item 1.b)
        publishedAt: rawData.publishedAt,
        createdAt: rawData.createdAt,
        updatedAt: rawData.updatedAt,
        // Thumbnail stored in Firebase Storage (works for draft/private videos)
        storageThumbnailUrl: rawData.storageThumbnailUrl,
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
      status: status ?? 'all',
      totalCount,
      returnedCount: paginatedVideos.length,
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
 * AUTO-DRAFT: If the video status is 'new' and we're updating any field
 * (except explicitly setting status), the status is automatically changed
 * to 'draft'. This reflects that the video has been modified by the platform.
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
    let updateData: Record<string, unknown> = { ...validated }
    const needsEmbeddingRegen = 'title' in validated || 'description' in validated

    // Read current doc if needed (for auto-draft check or embedding regeneration)
    let currentData: Record<string, unknown> | undefined
    if (!('status' in validated) || needsEmbeddingRegen) {
      const docSnap = await docRef.get()
      currentData = docSnap.data() as Record<string, unknown> | undefined
    }

    // AUTO-DRAFT: If not explicitly setting status, transition from 'new' to 'draft'
    if (!('status' in validated) && currentData?.status === 'new') {
      updateData.status = 'draft'
      log('INFO', 'Auto-transitioning video status from new to draft', { podcastId, videoId })
    }

    await docRef.update({
      ...updateData,
      updatedAt: FieldValue.serverTimestamp(),
    })

    log('INFO', 'Video updated (admin)', { podcastId, videoId, fields: Object.keys(validated) })

    // Re-embed if title/description changed (best-effort, Epic 17.5)
    if (needsEmbeddingRegen && currentData) {
      const title = (validated.title ?? currentData.title ?? '') as string
      const description = (validated.description ?? currentData.description ?? '') as string
      try {
        await embedVideo(podcastId, videoId, title, description)
      } catch (embedError) {
        log('WARN', 'Failed to regenerate embedding after update', {
          podcastId,
          videoId,
          error: embedError instanceof Error ? embedError.message : String(embedError),
        })
      }
    }
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
    log('INFO', 'Batch write with no operations, skipping', { podcastId })
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

/**
 * Updates the embedding vector for a video document.
 *
 * Uses update() with explicit fields (enforcement rule #4).
 * Sets summaryVector as Firestore Vector nativo and hasEmbedding flag.
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param videoId - The video document ID
 * @param vector - The embedding vector (768 dimensions)
 */
export async function updateVideoEmbedding(
  podcastId: string,
  videoId: string,
  vector: number[]
): Promise<void> {
  const db = getAdminDb()
  const docRef = db.collection('podcasts').doc(podcastId).collection('videos').doc(videoId)

  try {
    await docRef.update({
      summaryVector: FieldValue.vector(vector),
      hasEmbedding: true,
      updatedAt: FieldValue.serverTimestamp(),
    })

    log('INFO', 'Video embedding updated', { podcastId, videoId, dimensions: vector.length })
  } catch (error) {
    log('ERROR', 'Failed to update video embedding', { podcastId, videoId, error })
    throw error
  }
}

/**
 * Finds episodes similar to a query vector using Firestore vector search.
 *
 * Uses findNearest with COSINE distance on the summaryVector field.
 * Filters by videoType == 'episode' and hasEmbedding == true.
 * Requires a composite vector index on the videos collection.
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param queryVector - The embedding vector to search against (768 dimensions)
 * @param limit - Maximum number of results (default: 5)
 * @returns Array of similar episodes as VideoSummary, ordered by relevance
 */
export async function findSimilarEpisodes(
  podcastId: string,
  queryVector: number[],
  limit: number = 5
): Promise<VideoSummary[]> {
  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  try {
    const query = videosRef
      .where('videoType', '==', 'episode')
      .where('hasEmbedding', '==', true)

    const vectorQuery = query.findNearest(
      'summaryVector',
      FieldValue.vector(queryVector),
      { limit, distanceMeasure: 'COSINE' }
    )

    const snapshot = await vectorQuery.get()

    if (snapshot.empty) {
      log('INFO', 'No similar episodes found', { podcastId, queryVectorLength: queryVector.length })
      return []
    }

    const episodes: VideoSummary[] = []

    for (const docSnap of snapshot.docs) {
      const rawData = docSnap.data()
      const parsed = VideoSummarySchema.safeParse({
        ...rawData,
        id: docSnap.id,
        title: rawData.title ?? 'Sem título',
      })
      if (parsed.success) {
        episodes.push(parsed.data)
      } else {
        log('WARN', 'Skipping invalid video in similarity results', {
          videoId: docSnap.id,
          errors: parsed.error.issues,
        })
      }
    }

    log('INFO', 'Similar episodes found', {
      podcastId,
      queryVectorLength: queryVector.length,
      resultsCount: episodes.length,
    })

    return episodes
  } catch (error) {
    log('ERROR', 'Failed to find similar episodes', { podcastId, error })
    throw error
  }
}

/**
 * Gets all existing video IDs for a podcast (optimized query).
 *
 * Uses .select() to return only document IDs without fetching data.
 * Returns a Set for O(1) lookup performance in delta sync.
 *
 * @param podcastId - The podcast document ID
 * @returns Set of existing video IDs
 */
export async function getExistingVideoIds(podcastId: string): Promise<Set<string>> {
  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  const snapshot = await videosRef.select().get() // Apenas IDs, sem dados

  const ids = new Set(snapshot.docs.map((doc) => doc.id))

  log('INFO', 'Existing video IDs loaded for delta sync', {
    podcastId,
    count: ids.size,
  })

  return ids
}

/**
 * Gets episodes for cut/reel parent selection.
 *
 * Returns ALL episodes (videoType = 'episode') sorted by publishedAt desc.
 * If an episode doesn't have theme/guests, the inheritance will fail silently.
 * Used in Phase 0 (Parent Selection) for cut/reel videos.
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param limit - Maximum number of episodes to return (default: no limit)
 * @returns Array of video summaries for episodes, sorted by publishedAt desc
 */
export async function getEpisodesWithContext(
  podcastId: string,
  limit?: number
): Promise<VideoSummary[]> {
  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  try {
    // Query all episodes - no filter by theme
    // If episode doesn't have theme/guests, inheritance fails silently
    const snapshot = await videosRef
      .where('videoType', '==', 'episode')
      .get()

    if (snapshot.empty) {
      return []
    }

    const episodes: Array<VideoSummary & { _publishedAt: Date }> = []

    for (const docSnap of snapshot.docs) {
      const rawData = docSnap.data()

      // Parse publishedAt safely for sorting
      const publishedAtDate = parsePublishedAt(rawData.publishedAt)

      episodes.push({
        id: docSnap.id,
        title: rawData.title ?? 'Sem título',
        thumbnails: rawData.thumbnails,
        storageThumbnailUrl: rawData.storageThumbnailUrl, // Base64 cached thumbnail
        duration: rawData.duration ?? 0,
        status: rawData.status ?? 'new',
        videoType: 'episode',
        transcriptionSRT: rawData.transcriptionSRT,
        transcriptionTXT: rawData.transcriptionTXT,
        // Include context fields for preview (may be undefined)
        theme: rawData.theme,
        guests: rawData.guests,
        // Include original publishedAt (preserving Firestore type)
        publishedAt: rawData.publishedAt,
        // Internal field for sorting
        _publishedAt: publishedAtDate,
      })
    }

    // Sort by publishedAt desc (most recent first)
    episodes.sort((a, b) => b._publishedAt.getTime() - a._publishedAt.getTime())

    // Apply limit if specified and remove internal _publishedAt field
    const sliced = limit ? episodes.slice(0, limit) : episodes
    const result: VideoSummary[] = sliced.map(({ _publishedAt, ...episode }) => episode)

    log('INFO', 'Episodes fetched for parent selection', {
      podcastId,
      count: result.length,
      limit,
    })

    return result
  } catch (error) {
    log('ERROR', 'Failed to get episodes for parent selection', { podcastId, error })
    throw error
  }
}

/**
 * Gets all child videos (cuts and reels) for a given parent episode.
 *
 * Queries by parentEpisodeId field. Validates each document with VideoSchema,
 * skipping invalid documents.
 *
 * Path: podcasts/{podcastId}/videos where parentEpisodeId == parentEpisodeId
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param parentEpisodeId - The parent episode video ID
 * @returns Array of validated child video documents
 */
export async function getChildVideos(
  podcastId: string,
  parentEpisodeId: string
): Promise<Video[]> {
  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  const snapshot = await videosRef.where('parentEpisodeId', '==', parentEpisodeId).get()

  if (snapshot.empty) {
    log('INFO', 'No child videos found for episode', { podcastId, parentEpisodeId })
    return []
  }

  const videos: Video[] = []

  for (const docSnap of snapshot.docs) {
    const rawData = docSnap.data()
    const data = { id: docSnap.id, ...rawData } as Record<string, unknown>

    const parsed = VideoSchema.safeParse(data)
    if (parsed.success) {
      videos.push(parsed.data)
    } else {
      log('WARN', 'Child video validation failed, skipping', {
        podcastId,
        parentEpisodeId,
        videoId: docSnap.id,
        issues: parsed.error.issues,
      })
    }
  }

  log('INFO', 'Child videos fetched', {
    podcastId,
    parentEpisodeId,
    count: videos.length,
  })

  return videos
}
