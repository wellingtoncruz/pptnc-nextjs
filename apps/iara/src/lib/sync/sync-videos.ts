/**
 * Video synchronization orchestration.
 *
 * Syncs videos between YouTube API and Firestore:
 * - Creates new videos found on YouTube (only if not already exists)
 * - Updates existing videos with YouTube data changes
 * - Soft deletes videos removed from YouTube
 *
 * Campos do YouTube (title, description, etc.) são valores iniciais.
 * O produtor pode editar diretamente e usar "Restaurar dados do YouTube"
 * para reverter aos valores originais.
 *
 * REGRA IMUTÁVEL: O schema de videos NUNCA pode ser incompatível com
 * EpisodeEntity do portal-web (packages/types/src/episode.ts).
 *
 * @see architecture-iara.md#Data Architecture
 */

import { Timestamp } from 'firebase-admin/firestore'

import { batchWriteVideos, getAllVideosRaw } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { log } from '@/lib/logger'
import { classifyVideoType, needsIaraFields } from '@/lib/video-utils'
import { YouTubeClient, type YouTubeVideoDataFromAPI } from '@/lib/youtube'
import type { VideoCreate, VideoUpdate } from '@/types/video'

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  /** Number of new videos added */
  added: number
  /** Number of existing videos updated */
  updated: number
  /** Number of videos soft deleted */
  deleted: number
}

/**
 * Fetches all videos from YouTube, handling pagination.
 *
 * @param client - YouTube API client
 * @returns Array of all videos from the channel
 */
async function fetchAllYouTubeVideos(client: YouTubeClient): Promise<YouTubeVideoDataFromAPI[]> {
  const allVideos: YouTubeVideoDataFromAPI[] = []
  let pageToken: string | undefined

  do {
    const result = await client.listVideos(50, pageToken)
    allVideos.push(...result.videos)
    pageToken = result.nextPageToken
  } while (pageToken)

  return allVideos
}

/**
 * Converts YouTube API video to Firestore VideoCreate (flat structure).
 *
 * Uses FLAT fields compatible with portal-web/EpisodeEntity schema.
 */
function youtubeToVideoCreate(
  youtubeVideo: YouTubeVideoDataFromAPI,
  podcastId: string,
  videoType: 'episode' | 'cut' | 'reel'
): VideoCreate {
  return {
    id: youtubeVideo.id,
    podcastId,
    // Flat YouTube fields (compatible with EpisodeEntity)
    title: youtubeVideo.title,
    description: youtubeVideo.description,
    thumbnails: {
      high: { url: youtubeVideo.thumbnail, width: 480, height: 360 },
    },
    duration: youtubeVideo.duration,
    publishedAt: Timestamp.fromDate(new Date(youtubeVideo.publishedAt)),
    // IAra-specific fields
    status: 'new', // All new videos start with 'new' status
    videoType,
    deleted: false,
  }
}

/**
 * Creates VideoUpdate data from YouTube video (flat structure).
 *
 * For documents with IAra fields: preserves existing status and videoType
 * For documents without IAra fields: adds status='new' and videoType
 *
 * @param youtubeVideo - YouTube video data
 * @param needsEnrichment - Whether the document needs IAra fields added
 * @param videoType - Video type classification (only used for enrichment)
 */
function youtubeToVideoUpdate(
  youtubeVideo: YouTubeVideoDataFromAPI,
  needsEnrichment: boolean,
  videoType?: 'episode' | 'cut' | 'reel'
): VideoUpdate {
  const update: VideoUpdate = {
    // Flat YouTube fields (compatible with EpisodeEntity)
    title: youtubeVideo.title,
    description: youtubeVideo.description,
    thumbnails: {
      high: { url: youtubeVideo.thumbnail, width: 480, height: 360 },
    },
    duration: youtubeVideo.duration,
    publishedAt: Timestamp.fromDate(new Date(youtubeVideo.publishedAt)),
  }

  // For documents without IAra fields, add them
  // This enriches existing documents with IAra fields incrementally
  if (needsEnrichment && videoType) {
    update.status = 'new' // Default status for newly enriched docs
    update.videoType = videoType
  }

  return update
}

/**
 * Synchronizes videos from YouTube to Firestore.
 *
 * Algorithm:
 * 1. Fetch ALL videos from YouTube (handle pagination)
 * 2. Fetch ALL existing video IDs from Firestore
 * 3. Compare by document ID (YouTube videoId)
 * 4. Execute batch writes with merge (preserves existing fields)
 *
 * CRITICAL: Detection uses document ID (YouTube videoId) as the unique key.
 * IAra ADDS fields to existing documents; it does NOT restructure them.
 *
 * @param podcastId - The podcast document ID
 * @param accessToken - YouTube OAuth access token
 * @returns Sync result with counts
 * @throws Error if podcast not found
 */
export async function syncVideos(
  podcastId: string,
  accessToken: string
): Promise<SyncResult> {
  log('INFO', 'Starting video sync', { podcastId })

  // 1. Get podcast config (needed for video type classification)
  const podcast = await getPodcastAdmin(podcastId)
  if (!podcast) {
    throw new Error(`Podcast not found: ${podcastId}`)
  }

  // 2. Fetch all videos from YouTube
  const client = new YouTubeClient(accessToken)
  const youtubeVideos = await fetchAllYouTubeVideos(client)

  log('INFO', 'YouTube videos fetched', { podcastId, count: youtubeVideos.length })

  // 3. Fetch ALL existing videos from Firestore (raw documents)
  const firestoreVideosRaw = await getAllVideosRaw(podcastId)

  log('INFO', 'Firestore videos fetched', {
    podcastId,
    count: firestoreVideosRaw.length,
  })

  // 4. Build comparison map by document ID
  const youtubeIds = new Set(youtubeVideos.map((v) => v.id))
  const firestoreMap = new Map<string, { id: string; deleted?: boolean; needsEnrichment: boolean }>(
    firestoreVideosRaw.map((doc) => [
      doc.id,
      {
        id: doc.id,
        deleted: doc.deleted === true,
        needsEnrichment: needsIaraFields(doc),
      },
    ])
  )

  // Count documents needing IAra fields for logging
  const needsEnrichmentCount = firestoreVideosRaw.filter((doc) => needsIaraFields(doc)).length
  const hasIaraFieldsCount = firestoreVideosRaw.length - needsEnrichmentCount

  log('INFO', 'Document status', {
    podcastId,
    total: firestoreVideosRaw.length,
    needsIaraFields: needsEnrichmentCount,
    hasIaraFields: hasIaraFieldsCount,
  })

  // 5. Categorize operations
  const toCreate: VideoCreate[] = []
  const toUpdate: Array<{ id: string; data: VideoUpdate }> = []
  const toDelete: string[] = []

  // Find new videos (in YouTube but not in Firestore)
  for (const ytVideo of youtubeVideos) {
    const existing = firestoreMap.get(ytVideo.id)
    const videoType = classifyVideoType(ytVideo.duration, podcast.videoTypes)

    if (!existing) {
      // New video - classify type and create
      toCreate.push(youtubeToVideoCreate(ytVideo, podcastId, videoType))
    } else if (!existing.deleted) {
      // Existing video - update YouTube data
      // For docs without IAra fields: adds status, videoType
      // For docs with IAra fields: only updates YouTube data
      toUpdate.push({
        id: ytVideo.id,
        data: youtubeToVideoUpdate(ytVideo, existing.needsEnrichment, videoType),
      })
    }
    // If existing.deleted === true, skip - don't update deleted videos
  }

  // Find deleted videos (in Firestore but not in YouTube)
  for (const [id, fsVideo] of firestoreMap) {
    if (!youtubeIds.has(id) && !fsVideo.deleted) {
      // Video was removed from YouTube - soft delete
      toDelete.push(id)
    }
  }

  log('INFO', 'Sync operations determined', {
    podcastId,
    creates: toCreate.length,
    updates: toUpdate.length,
    deletes: toDelete.length,
  })

  // 6. Execute batch write
  // NOTE: batchWriteVideos uses update() for updates, which merges fields
  // This preserves existing fields while adding new ones
  await batchWriteVideos(podcastId, {
    creates: toCreate,
    updates: toUpdate,
    deletes: toDelete,
  })

  const result: SyncResult = {
    added: toCreate.length,
    updated: toUpdate.length,
    deleted: toDelete.length,
  }

  log('INFO', 'Video sync completed', { podcastId, ...result })

  return result
}
