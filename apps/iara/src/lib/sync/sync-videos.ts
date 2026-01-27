/**
 * Video import from YouTube.
 *
 * Imports NEW videos from YouTube to Firestore:
 * - Creates new videos found on YouTube (only if not already exists)
 * - Existing videos are NOT modified
 * - Videos are NEVER deleted
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
import { classifyVideoType } from '@/lib/video-utils'
import { YouTubeClient, type YouTubeVideoDataFromAPI } from '@/lib/youtube'
import type { VideoCreate } from '@/types/video'

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  /** Number of new videos added */
  added: number
  /** Number of existing videos (not modified) */
  skipped: number
}

/**
 * Fetches all videos from YouTube, handling pagination.
 *
 * @param client - YouTube API client
 * @param channelId - YouTube channel ID to fetch videos from
 * @returns Array of all videos from the channel
 */
async function fetchAllYouTubeVideos(
  client: YouTubeClient,
  channelId: string
): Promise<YouTubeVideoDataFromAPI[]> {
  const allVideos: YouTubeVideoDataFromAPI[] = []
  let pageToken: string | undefined

  do {
    const result = await client.listVideos({ maxResults: 50, pageToken, channelId })
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
 * Imports new videos from YouTube to Firestore.
 *
 * Algorithm:
 * 1. Fetch ALL videos from YouTube (handle pagination)
 * 2. Fetch ALL existing video IDs from Firestore
 * 3. Compare by document ID (YouTube videoId)
 * 4. Create ONLY videos that don't exist yet
 *
 * IMPORTANT: Existing videos are NEVER modified. Videos are NEVER deleted.
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
  log('INFO', 'Starting video import', { podcastId })

  // 1. Get podcast config (needed for video type classification and channelId)
  const podcast = await getPodcastAdmin(podcastId)
  if (!podcast) {
    throw new Error(`Podcast not found: ${podcastId}`)
  }

  // 2. Fetch all videos from YouTube using podcast's channelId
  const client = new YouTubeClient(accessToken)
  const youtubeVideos = await fetchAllYouTubeVideos(client, podcast.channelId)

  log('INFO', 'YouTube videos fetched', {
    podcastId,
    channelId: podcast.channelId,
    count: youtubeVideos.length,
  })

  // 3. Fetch ALL existing video IDs from Firestore
  const firestoreVideosRaw = await getAllVideosRaw(podcastId)
  const existingIds = new Set(firestoreVideosRaw.map((doc) => doc.id))

  log('INFO', 'Firestore videos fetched', {
    podcastId,
    count: existingIds.size,
  })

  // 4. Find NEW videos only (in YouTube but not in Firestore)
  const toCreate: VideoCreate[] = []

  for (const ytVideo of youtubeVideos) {
    if (!existingIds.has(ytVideo.id)) {
      const videoType = classifyVideoType(ytVideo.duration, podcast.videoTypes)
      toCreate.push(youtubeToVideoCreate(ytVideo, podcastId, videoType))
    }
  }

  const skipped = youtubeVideos.length - toCreate.length

  log('INFO', 'Import operations determined', {
    podcastId,
    newVideos: toCreate.length,
    existingVideos: skipped,
  })

  // 5. Execute batch write (creates only, no updates, no deletes)
  if (toCreate.length > 0) {
    await batchWriteVideos(podcastId, {
      creates: toCreate,
      updates: [],
      deletes: [],
    })
  }

  const result: SyncResult = {
    added: toCreate.length,
    skipped,
  }

  log('INFO', 'Video import completed', { podcastId, ...result })

  return result
}
