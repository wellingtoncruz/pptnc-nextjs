/**
 * Video import from YouTube.
 *
 * Imports NEW videos from YouTube to Firestore:
 * - Creates new videos found on YouTube (only if not already exists)
 * - Existing videos are NEVER modified — sent videos stay sent regardless of
 *   any change in YouTube visibility. Reopening a sent video for editing only
 *   happens through explicit user action (POST /api/videos/[videoId]/reopen).
 * - Videos are NEVER deleted.
 *
 * Note: Transcriptions are NOT fetched during sync (Story 5.6 - Transcrição On-Demand).
 * They are fetched on-demand when the producer selects a video in the Wizard.
 * This preserves YouTube API quota (200 units per transcription).
 *
 * REGRA IMUTÁVEL: O schema de videos NUNCA pode ser incompatível com
 * EpisodeEntity do portal-web (packages/types/src/episode.ts).
 *
 * @see architecture-iara.md#Data Architecture
 * @see Story 5.6 - Transcrição On-Demand
 */

import { Timestamp } from 'firebase-admin/firestore'

import { batchWriteVideos, getExistingVideoIds } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { uploadVideoThumbnail } from '@/lib/firebase/storage-admin'
import { log } from '@/lib/logger'
import { classifyVideoType, getBestThumbnailUrl } from '@/lib/video-utils'
import { YouTubeClient, type YouTubeVideoDataFromAPI } from '@/lib/youtube'
import { embedVideos } from '@/lib/embedding/video-embedding'
import type { VideoCreate } from '@/types/video'

/** Maximum concurrent thumbnail uploads to avoid overwhelming Firebase Storage */
const THUMBNAIL_UPLOAD_CONCURRENCY = 5

/**
 * Maps over items with controlled concurrency.
 *
 * Unlike Promise.all which runs everything at once, this limits
 * the number of concurrent operations to avoid overwhelming
 * external services (Firebase Storage, network, etc).
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Maximum concurrent operations
 * @returns Array of results in same order as input
 */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  if (items.length === 0) return []

  const results: R[] = new Array(items.length)
  let currentIndex = 0

  async function worker(): Promise<void> {
    while (true) {
      const index = currentIndex++
      if (index >= items.length) break // Check AFTER increment to avoid race condition
      results[index] = await fn(items[index], index)
    }
  }

  // Start `concurrency` workers (or fewer if items < concurrency)
  const workerCount = Math.min(concurrency, items.length)
  const workers = Array.from({ length: workerCount }, () => worker())

  await Promise.all(workers)
  return results
}

/**
 * Result of a sync operation.
 *
 * Note: Transcriptions are no longer fetched during sync.
 * They are fetched on-demand when the producer selects a video.
 * @see Story 5.6 - Transcrição On-Demand
 */
export interface SyncResult {
  /** Number of new videos added (non-public → new status) */
  added: number
  /** Number of new videos that were public (→ sent status) */
  addedAsSent: number
  /** Number of existing videos (not modified) */
  skipped: number
  /** Number of live broadcasts excluded from import */
  liveBroadcastsExcluded: number
  /** Summary for UI: total new videos found */
  newVideos: number
}

/**
 * Fetches only NEW videos from YouTube using optimized 2-phase delta sync.
 *
 * Phase 1: Collect only video IDs using playlistItems.list (1 API call per page)
 * Phase 2: Fetch video details only for NEW IDs using videos.list
 *
 * This optimization avoids fetching video details for videos that already exist
 * in Firestore, saving quota when a page contains both new and existing videos.
 *
 * Algorithm:
 * 1. Iterate through all pages of the uploads playlist
 * 2. Skip video IDs that already exist in Firestore
 * 3. Collect all NEW video IDs (not in Firestore)
 * 4. Only fetch video details for the filtered list of new IDs
 *
 * Note: We do NOT use early exit because private/draft videos may be
 * interspersed with public (already synced) videos in chronological order.
 *
 * @param client - YouTube API client
 * @param channelId - YouTube channel ID to fetch videos from
 * @param existingIds - Set of video IDs that already exist in Firestore
 * @returns Array of new videos only (not in Firestore)
 */
async function fetchNewYouTubeVideos(
  client: YouTubeClient,
  channelId: string,
  existingIds: Set<string>
): Promise<YouTubeVideoDataFromAPI[]> {
  const newVideoIds: string[] = []
  let pageToken: string | undefined
  let pagesChecked = 0
  let totalIdsChecked = 0
  let skippedExisting = 0

  // Convert channelId to uploads playlist ID
  const uploadsPlaylistId = YouTubeClient.channelIdToUploadsPlaylist(channelId)

  // PHASE 1: Collect only NEW video IDs (playlistItems.list only)
  // Iterate through ALL pages, skipping existing IDs
  do {
    pagesChecked++
    const { videoIds, nextPageToken } = await client.listPlaylistItems(
      uploadsPlaylistId,
      50,
      pageToken
    )

    totalIdsChecked += videoIds.length

    for (const id of videoIds) {
      if (existingIds.has(id)) {
        // Skip existing video, but continue checking others
        skippedExisting++
        continue
      }
      newVideoIds.push(id)
    }

    pageToken = nextPageToken
  } while (pageToken)

  // PHASE 2: Fetch video details ONLY for new IDs
  const newVideos = newVideoIds.length > 0
    ? await client.getVideoDetailsBatch(newVideoIds)
    : []

  // Calculate metrics
  const videoDetailsCalls = Math.ceil(newVideoIds.length / 50)
  const playlistItemsCalls = pagesChecked

  // With 2-phase approach: playlistItems calls + video details calls
  // Without optimization: would be pagesChecked * 2 (playlistItems + videos per page)
  const quotaUsed = playlistItemsCalls + videoDetailsCalls
  const quotaWithoutOptimization = pagesChecked * 2
  const quotaSaved = Math.max(0, quotaWithoutOptimization - quotaUsed)

  log('INFO', 'Delta sync fetch completed (2-phase optimized)', {
    pagesChecked,
    totalIdsChecked,
    skippedExisting,
    newVideosFound: newVideos.length,
    existingVideosCount: existingIds.size,
    playlistItemsCalls,
    videoDetailsCalls,
    quotaUsed,
    quotaSaved,
  })

  return newVideos
}

/**
 * Checks if a video is a live broadcast (active, upcoming, or finished).
 *
 * Live broadcasts should be excluded from import as they are not
 * regular video content that needs metadata processing.
 *
 * Detection:
 * - liveBroadcastContent === 'live' or 'upcoming' → active/scheduled live
 * - wasLiveBroadcast === true → finished live (has actualEndTime in liveStreamingDetails)
 *
 * @param video - YouTube video data
 * @returns true if video is any kind of live broadcast
 */
function isLiveBroadcast(video: YouTubeVideoDataFromAPI): boolean {
  // Active or scheduled live broadcasts
  if (video.liveBroadcastContent === 'live' || video.liveBroadcastContent === 'upcoming') {
    return true
  }
  // Finished live broadcasts (detected via liveStreamingDetails.actualEndTime)
  if (video.wasLiveBroadcast) {
    return true
  }
  return false
}

/**
 * Filters out live broadcasts from video list.
 *
 * @param videos - Array of YouTube videos
 * @returns Object with filtered videos and count of excluded live broadcasts
 */
function filterLiveBroadcasts(
  videos: YouTubeVideoDataFromAPI[]
): { videos: YouTubeVideoDataFromAPI[]; excludedCount: number } {
  const filtered = videos.filter((v) => !isLiveBroadcast(v))
  const excludedCount = videos.length - filtered.length
  return { videos: filtered, excludedCount }
}

/**
 * Determines initial status based on YouTube visibility.
 *
 * - Public videos → 'sent' (already published, no editing needed)
 * - Non-public videos (private, unlisted) → 'new' (needs processing)
 */
export function getInitialStatusFromVisibility(privacyStatus: 'public' | 'unlisted' | 'private'): 'new' | 'sent' {
  return privacyStatus === 'public' ? 'sent' : 'new'
}

/**
 * Converts YouTube API video to Firestore VideoCreate (flat structure).
 *
 * Uses FLAT fields compatible with portal-web/EpisodeEntity schema.
 * Status is determined by visibility: public → sent, others → new
 *
 * @param youtubeVideo - Video data from YouTube API
 * @param podcastId - Podcast ID
 * @param videoType - Classified video type
 * @param storageThumbnailUrl - Optional URL of thumbnail stored in Firebase Storage
 */
export function youtubeToVideoCreate(
  youtubeVideo: YouTubeVideoDataFromAPI,
  podcastId: string,
  videoType: 'episode' | 'cut' | 'reel',
  storageThumbnailUrl?: string | null
): VideoCreate {
  const status = getInitialStatusFromVisibility(youtubeVideo.privacyStatus)

  return {
    id: youtubeVideo.id,
    podcastId,
    // Flat YouTube fields (compatible with EpisodeEntity)
    title: youtubeVideo.title,
    description: youtubeVideo.description,
    thumbnails: youtubeVideo.thumbnails,
    duration: youtubeVideo.duration,
    publishedAt: Timestamp.fromDate(new Date(youtubeVideo.publishedAt)),
    // IAra-specific fields
    status, // Determined by visibility: public → sent, others → new
    videoType,
    youtubePrivacyStatus: youtubeVideo.privacyStatus,
    visibilityUpdatedAt: Timestamp.now(),
    // Thumbnail stored in Firebase Storage (works for draft/private videos)
    ...(storageThumbnailUrl && { storageThumbnailUrl }),
    // Embedding flag (Epic 17) — starts as false, set to true after embedding generation
    hasEmbedding: false,
  }
}

/**
 * Imports new videos from YouTube to Firestore.
 *
 * Uses DELTA SYNC with early exit optimization (Story 7.1):
 * - Only fetches new videos from YouTube (stops when finding existing video)
 * - Reduces API quota usage by ~60-80% on regular syncs
 *
 * Algorithm:
 * 1. Get existing video IDs from Firestore (optimized query)
 * 2. Fetch only NEW videos from YouTube using delta sync with early exit
 * 3. Filter out live broadcasts (live/upcoming are excluded from import)
 * 4. For NEW videos: create with status based on visibility (public → sent, others → new)
 *
 * IMPORTANT: Existing videos are NEVER modified by sync. A sent video stays
 * sent even if its YouTube visibility changes to private/unlisted — the only
 * way back to draft is the explicit user-triggered reopen flow
 * (POST /api/videos/[videoId]/reopen). Videos are NEVER deleted. Live
 * broadcasts are never imported.
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
    throw new Error(`Podcast não encontrado: ${podcastId}`)
  }

  if (!podcast.channelId) {
    throw new Error(
      `Podcast "${podcastId}" não possui channelId configurado. Configure o canal do YouTube nas configurações do podcast.`
    )
  }

  // 2. Get existing video IDs for delta sync (optimized query)
  const existingIds = await getExistingVideoIds(podcastId)

  // 3. Fetch only NEW videos from YouTube using delta sync with early exit
  const client = new YouTubeClient(accessToken)
  const newYoutubeVideos = await fetchNewYouTubeVideos(client, podcast.channelId, existingIds)

  // 4. Filter out live broadcasts (unless podcast config includes them)
  const includeLivestreams = podcast.features?.includeLivestreams ?? false
  const { videos: filteredNewVideos, excludedCount: liveBroadcastsExcluded } = includeLivestreams
    ? { videos: newYoutubeVideos, excludedCount: 0 }
    : filterLiveBroadcasts(newYoutubeVideos)

  log('INFO', 'New YouTube videos fetched (delta sync)', {
    podcastId,
    channelId: podcast.channelId,
    newVideosFound: newYoutubeVideos.length,
    afterLiveFilter: filteredNewVideos.length,
    liveBroadcastsExcluded,
    existingVideosSkipped: existingIds.size,
  })

  // 5. Process NEW videos (already filtered, no need to check existingVideoMap)
  const newVideosToProcess: Array<{ ytVideo: YouTubeVideoDataFromAPI; videoType: 'episode' | 'cut' | 'reel' }> = []
  let addedAsNew = 0
  let addedAsSent = 0

  for (const ytVideo of filteredNewVideos) {
    const videoType = classifyVideoType(ytVideo.duration, podcast.videoTypes)
    newVideosToProcess.push({ ytVideo, videoType })

    // Track how many were added with each status
    const status = getInitialStatusFromVisibility(ytVideo.privacyStatus)
    if (status === 'sent') {
      addedAsSent++
    } else {
      addedAsNew++
    }
  }

  // 6. Upload thumbnails to Firebase Storage for new videos (PARALLEL)
  // This ensures thumbnails work even for draft/private videos
  // Uses controlled concurrency to avoid overwhelming Firebase Storage
  const thumbnailStartTime = Date.now()

  log('INFO', 'Uploading thumbnails to Storage (parallel)', {
    podcastId,
    count: newVideosToProcess.length,
    concurrency: THUMBNAIL_UPLOAD_CONCURRENCY,
  })

  const toCreate: VideoCreate[] = await parallelMap(
    newVideosToProcess,
    async ({ ytVideo, videoType }) => {
      // Build list of thumbnail URLs to try (prefer higher resolution)
      const thumbnailUrls: string[] = []
      const thumbs = ytVideo.thumbnails
      if (thumbs.maxres?.url) thumbnailUrls.push(thumbs.maxres.url)
      if (thumbs.standard?.url) thumbnailUrls.push(thumbs.standard.url)
      if (thumbs.high?.url) thumbnailUrls.push(thumbs.high.url)
      if (thumbs.medium?.url) thumbnailUrls.push(thumbs.medium.url)
      if (thumbs.default?.url) thumbnailUrls.push(thumbs.default.url)

      // Upload thumbnail to Storage (with error handling per item)
      let storageThumbnailUrl: string | null = null
      if (thumbnailUrls.length > 0) {
        try {
          storageThumbnailUrl = await uploadVideoThumbnail(podcastId, ytVideo.id, thumbnailUrls)
        } catch (error) {
          // Log warning but continue - individual thumbnail failure should not break sync
          log('WARN', 'Failed to upload thumbnail, continuing without it', {
            videoId: ytVideo.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      return youtubeToVideoCreate(ytVideo, podcastId, videoType, storageThumbnailUrl)
    },
    THUMBNAIL_UPLOAD_CONCURRENCY
  )

  const thumbnailTimeMs = Date.now() - thumbnailStartTime
  if (newVideosToProcess.length > 0) {
    log('INFO', 'Thumbnail uploads completed', {
      podcastId,
      count: toCreate.length,
      timeMs: thumbnailTimeMs,
      avgTimePerVideo: Math.round(thumbnailTimeMs / toCreate.length),
    })
  }

  // With delta sync, skipped = existing videos (not re-fetched)
  const skipped = existingIds.size

  log('INFO', 'Import operations determined (delta sync)', {
    podcastId,
    newVideosAsNew: addedAsNew,
    newVideosAsSent: addedAsSent,
    existingVideosSkipped: skipped,
    deltaSyncSavings: `Skipped fetching ${skipped} existing videos`,
  })

  // 7. Execute batch write for creates
  if (toCreate.length > 0) {
    await batchWriteVideos(podcastId, {
      creates: toCreate,
      updates: [],
      deletes: [],
    })
  }

  // 8. Generate embeddings for new videos (best-effort, Epic 17)
  if (toCreate.length > 0) {
    try {
      const embeddingInputs = toCreate.map(v => ({
        videoId: v.id,
        title: v.title,
        description: v.description,
      }))
      const embeddingResult = await embedVideos(podcastId, embeddingInputs)
      log('INFO', 'Embeddings generated for new videos', {
        podcastId,
        succeeded: embeddingResult.succeeded,
        failed: embeddingResult.failed,
      })
    } catch (error) {
      log('WARN', 'Failed to generate embeddings for new videos', {
        podcastId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Note: Transcriptions are no longer fetched during sync (Story 5.6)
  // They are fetched on-demand when producer selects a video in the Wizard

  const result: SyncResult = {
    added: addedAsNew,
    addedAsSent,
    skipped,
    liveBroadcastsExcluded,
    // Summary fields for UI
    newVideos: toCreate.length,
  }

  log('INFO', 'Video import completed', { podcastId, ...result })

  return result
}
