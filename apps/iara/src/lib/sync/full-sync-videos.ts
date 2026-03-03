/**
 * Full video sync from YouTube.
 *
 * Updates ALL video metadata from YouTube to Firestore:
 * - Fetches all videos from the channel (not just new ones)
 * - Updates metadata fields (title, description, thumbnails, etc.)
 * - PRESERVES IAra-managed fields (status, processedContent, etc.)
 *
 * This is a high-quota operation and should be used sparingly.
 * Use regular sync (sync-videos.ts) for incremental updates.
 *
 * @see docs/stories/9-6-resync-completo.md
 */

import { Timestamp, FieldValue } from 'firebase-admin/firestore'

import { getAllVideosRaw } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getAdminDb } from '@/lib/firebase/admin'
import { log } from '@/lib/logger'
import { classifyVideoType } from '@/lib/video-utils'
import { YouTubeClient, type YouTubeVideoDataFromAPI } from '@/lib/youtube'
import { youtubeToVideoCreate } from '@/lib/sync/sync-videos'
import { embedVideos } from '@/lib/embedding/video-embedding'

/**
 * Result of a full sync operation.
 */
export interface FullSyncResult {
  /** Total videos in the channel */
  total: number
  /** Number of existing videos with metadata updated */
  updated: number
  /** Number of new videos added */
  added: number
  /** Number of videos with no changes */
  unchanged: number
}

/**
 * Lock status for preventing concurrent full sync operations.
 */
export interface SyncLockStatus {
  inProgress: boolean
  startedAt?: Date
  startedBy?: string
}

/** Lock timeout in minutes - orphaned locks older than this are ignored */
const LOCK_TIMEOUT_MINUTES = 30

/**
 * Checks the status of the full-sync lock.
 *
 * @param podcastId - The podcast document ID
 * @returns Lock status including whether sync is in progress
 */
export async function getFullSyncLockStatus(podcastId: string): Promise<SyncLockStatus> {
  const db = getAdminDb()
  const lockRef = db.collection('podcasts').doc(podcastId).collection('locks').doc('full-sync')

  const lockDoc = await lockRef.get()

  if (!lockDoc.exists) {
    return { inProgress: false }
  }

  const data = lockDoc.data()
  if (!data?.inProgress) {
    return { inProgress: false }
  }

  // Check if lock is expired (orphaned)
  const startedAt = data.startedAt?.toDate?.() ?? new Date(0)
  const minutesAgo = (Date.now() - startedAt.getTime()) / 60000

  if (minutesAgo >= LOCK_TIMEOUT_MINUTES) {
    // Lock is expired/orphaned, treat as not in progress
    log('WARN', 'Full sync lock is expired, ignoring', {
      podcastId,
      startedAt,
      minutesAgo,
    })
    return { inProgress: false }
  }

  return {
    inProgress: true,
    startedAt,
    startedBy: data.startedBy,
  }
}

/**
 * Acquires the full-sync lock.
 *
 * @param podcastId - The podcast document ID
 * @param userId - The user acquiring the lock
 * @throws Error if lock is already held by another operation
 */
async function acquireLock(podcastId: string, userId: string): Promise<void> {
  const lockStatus = await getFullSyncLockStatus(podcastId)

  if (lockStatus.inProgress) {
    throw new Error('Re-sync já em andamento, aguarde')
  }

  const db = getAdminDb()
  const lockRef = db.collection('podcasts').doc(podcastId).collection('locks').doc('full-sync')

  await lockRef.set({
    inProgress: true,
    startedAt: FieldValue.serverTimestamp(),
    startedBy: userId,
  })

  log('INFO', 'Full sync lock acquired', { podcastId, userId })
}

/**
 * Releases the full-sync lock.
 *
 * @param podcastId - The podcast document ID
 */
async function releaseLock(podcastId: string): Promise<void> {
  const db = getAdminDb()
  const lockRef = db.collection('podcasts').doc(podcastId).collection('locks').doc('full-sync')

  await lockRef.set({
    inProgress: false,
    completedAt: FieldValue.serverTimestamp(),
  })

  log('INFO', 'Full sync lock released', { podcastId })
}

/**
 * Checks if a video's metadata has changed compared to YouTube data.
 *
 * @param firestoreVideo - Current video data in Firestore
 * @param youtubeVideo - Fresh video data from YouTube
 * @returns true if any metadata field has changed
 */
function hasMetadataChanged(
  firestoreVideo: Record<string, unknown>,
  youtubeVideo: YouTubeVideoDataFromAPI
): boolean {
  // Compare title
  if (firestoreVideo.title !== youtubeVideo.title) return true

  // Compare description
  if (firestoreVideo.description !== youtubeVideo.description) return true

  // Compare duration
  if (firestoreVideo.duration !== youtubeVideo.duration) return true

  // Compare privacy status
  if (firestoreVideo.youtubePrivacyStatus !== youtubeVideo.privacyStatus) return true

  // Thumbnails comparison is complex (nested objects), so we'll consider them changed
  // if the maxres URL changed (most common change)
  const fsThumbs = firestoreVideo.thumbnails as Record<string, { url?: string }> | undefined
  const ytThumbs = youtubeVideo.thumbnails
  if (fsThumbs?.maxres?.url !== ytThumbs.maxres?.url) return true
  if (fsThumbs?.high?.url !== ytThumbs.high?.url) return true

  return false
}

/**
 * Best-effort embedding generation for a list of videos.
 * Logs success/failure but never throws (best-effort pattern).
 */
async function embedVideosBestEffort(
  podcastId: string,
  videos: Array<{ videoId: string; title: string; description?: string }>,
  context: string
): Promise<void> {
  if (videos.length === 0) return
  try {
    const result = await embedVideos(podcastId, videos)
    log('INFO', `Embeddings generated ${context} (full sync)`, {
      podcastId,
      succeeded: result.succeeded,
      failed: result.failed,
    })
  } catch (error) {
    log('WARN', `Failed to generate embeddings ${context} (full sync)`, {
      podcastId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Performs a full sync of all videos from YouTube.
 *
 * This operation:
 * 1. Fetches ALL videos from the YouTube channel
 * 2. For existing videos: updates metadata while preserving IAra fields
 * 3. For new videos: creates them with initial status based on visibility
 *
 * CRITICAL: This is a high-quota operation. Use sparingly.
 *
 * @param podcastId - The podcast document ID
 * @param accessToken - YouTube OAuth access token
 * @param userId - The user initiating the sync (for lock tracking)
 * @returns Full sync result with statistics
 * @throws Error if podcast not found or lock cannot be acquired
 */
export async function fullSyncVideos(
  podcastId: string,
  accessToken: string,
  userId: string
): Promise<FullSyncResult> {
  log('INFO', 'Starting full video sync', { podcastId, userId })

  // Acquire lock to prevent concurrent syncs
  await acquireLock(podcastId, userId)

  try {
    // 1. Get podcast config
    const podcast = await getPodcastAdmin(podcastId)
    if (!podcast) {
      throw new Error(`Podcast não encontrado: ${podcastId}`)
    }

    if (!podcast.channelId) {
      throw new Error(
        `Podcast "${podcastId}" não possui channelId configurado.`
      )
    }

    // 2. Fetch ALL videos from YouTube
    const client = new YouTubeClient(accessToken)
    const uploadsPlaylistId = YouTubeClient.channelIdToUploadsPlaylist(podcast.channelId)

    // Collect all video IDs first
    const allVideoIds: string[] = []
    let pageToken: string | undefined

    do {
      const { videoIds, nextPageToken } = await client.listPlaylistItems(
        uploadsPlaylistId,
        50,
        pageToken
      )
      allVideoIds.push(...videoIds)
      pageToken = nextPageToken
    } while (pageToken)

    log('INFO', 'Full sync: collected all video IDs', {
      podcastId,
      totalIds: allVideoIds.length,
    })

    // 3. Fetch video details for all videos
    const youtubeVideos: YouTubeVideoDataFromAPI[] = []
    for (let i = 0; i < allVideoIds.length; i += 50) {
      const batch = allVideoIds.slice(i, i + 50)
      const batchVideos = await client.getVideoDetailsBatch(batch)
      youtubeVideos.push(...batchVideos)
    }

    // Create lookup map
    const youtubeVideoMap = new Map(youtubeVideos.map(v => [v.id, v]))

    log('INFO', 'Full sync: fetched all video details', {
      podcastId,
      fetchedCount: youtubeVideos.length,
    })

    // 4. Get existing Firestore videos
    const firestoreVideos = await getAllVideosRaw(podcastId)
    const firestoreVideoMap = new Map(firestoreVideos.map(v => [v.id, v]))

    // 5. Process each YouTube video
    const db = getAdminDb()
    const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

    let updated = 0
    let added = 0
    let unchanged = 0
    const newVideosList: Array<{ videoId: string; title: string; description?: string }> = []
    const updatedVideosList: Array<{ videoId: string; title: string; description?: string }> = []

    // Process in batches for Firestore
    const BATCH_SIZE = 20
    let batch = db.batch()
    let batchCount = 0

    for (const ytVideo of youtubeVideos) {
      const existingVideo = firestoreVideoMap.get(ytVideo.id)
      const docRef = videosRef.doc(ytVideo.id)

      if (existingVideo) {
        // Video exists - check if metadata changed
        if (hasMetadataChanged(existingVideo, ytVideo)) {
          // Update ONLY metadata fields, preserve IAra fields
          batch.update(docRef, {
            title: ytVideo.title,
            description: ytVideo.description,
            thumbnails: ytVideo.thumbnails,
            duration: ytVideo.duration,
            publishedAt: Timestamp.fromDate(new Date(ytVideo.publishedAt)),
            youtubePrivacyStatus: ytVideo.privacyStatus,
            updatedAt: FieldValue.serverTimestamp(),
          })
          // Track updated videos with title/description changes for re-embedding (Story 17.5)
          if (existingVideo.title !== ytVideo.title || existingVideo.description !== ytVideo.description) {
            updatedVideosList.push({ videoId: ytVideo.id, title: ytVideo.title, description: ytVideo.description })
          }
          updated++
        } else {
          unchanged++
        }
      } else {
        // New video - create using shared function (same as delta sync)
        const videoType = classifyVideoType(ytVideo.duration, podcast.videoTypes)
        const videoCreate = youtubeToVideoCreate(ytVideo, podcastId, videoType)

        batch.set(docRef, {
          ...videoCreate,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
        newVideosList.push({ videoId: ytVideo.id, title: ytVideo.title, description: ytVideo.description })
        added++
      }

      batchCount++

      // Commit batch when it reaches the limit
      if (batchCount >= BATCH_SIZE) {
        await batch.commit()
        batch = db.batch()
        batchCount = 0
      }
    }

    // Commit any remaining operations
    if (batchCount > 0) {
      await batch.commit()
    }

    // Generate/regenerate embeddings best-effort (Epic 17 + Story 17.5)
    await embedVideosBestEffort(podcastId, newVideosList, 'for new videos')
    await embedVideosBestEffort(podcastId, updatedVideosList, 'for updated videos')

    const result: FullSyncResult = {
      total: youtubeVideos.length,
      updated,
      added,
      unchanged,
    }

    log('INFO', 'Full video sync completed', { podcastId, userId, ...result })

    return result
  } finally {
    // Always release lock
    await releaseLock(podcastId)
  }
}
