/**
 * Video import from YouTube.
 *
 * Imports NEW videos from YouTube to Firestore:
 * - Creates new videos found on YouTube (only if not already exists)
 * - Existing videos are NOT modified
 * - Videos are NEVER deleted
 *
 * Transcriptions are fetched using YouTube API v3 (captions endpoint).
 * To manage quota, only the 5 most recent new videos get transcriptions per sync.
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
import { parseSrtToText } from '@/lib/srt-parser'
import { classifyVideoType } from '@/lib/video-utils'
import { transition } from '@/lib/video-state-machine'
import { YouTubeClient, YouTubeAPIError, type YouTubeVideoDataFromAPI } from '@/lib/youtube'
import type { VideoCreate, VideoUpdate, VideoStatus, YouTubePrivacyStatus } from '@/types/video'

/** Maximum number of transcriptions to fetch per sync (quota management) */
const MAX_TRANSCRIPTIONS_PER_SYNC = 5

/** Maximum videos to track for transcription prioritization (memory management) */
const MAX_VIDEOS_TO_PRIORITIZE = 100

/**
 * Result of a sync operation.
 */
export interface SyncResult {
  /** Number of new videos added (non-public → new status) */
  added: number
  /** Number of new videos that were public (→ sent status) */
  addedAsSent: number
  /** Number of existing videos (not modified) */
  skipped: number
  /** Number of sent videos reopened (visibility changed to non-public) */
  reopened: number
  /** Number of live broadcasts excluded from import */
  liveBroadcastsExcluded: number
  /** Summary for UI: total new videos found */
  newVideos: number
  /** Summary for UI: videos that returned to edit mode */
  reopenedVideos: number
  /** Number of videos with transcription fetched successfully */
  transcriptionsFetched: number
  /** Number of videos where transcription was not available */
  transcriptionsUnavailable: number
  /** Error message if quota was exceeded */
  quotaError?: string
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
 * Checks if a video is a live broadcast (live or upcoming).
 *
 * Live broadcasts should be excluded from import as they are not
 * regular video content that needs metadata processing.
 *
 * @param video - YouTube video data
 * @returns true if video is a live broadcast (live or upcoming)
 */
function isLiveBroadcast(video: YouTubeVideoDataFromAPI): boolean {
  return video.liveBroadcastContent === 'live' || video.liveBroadcastContent === 'upcoming'
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
function getInitialStatusFromVisibility(privacyStatus: 'public' | 'unlisted' | 'private'): 'new' | 'sent' {
  return privacyStatus === 'public' ? 'sent' : 'new'
}

/**
 * Converts YouTube API video to Firestore VideoCreate (flat structure).
 *
 * Uses FLAT fields compatible with portal-web/EpisodeEntity schema.
 * Status is determined by visibility: public → sent, others → new
 */
function youtubeToVideoCreate(
  youtubeVideo: YouTubeVideoDataFromAPI,
  podcastId: string,
  videoType: 'episode' | 'cut' | 'reel'
): VideoCreate {
  const status = getInitialStatusFromVisibility(youtubeVideo.privacyStatus)

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
    status, // Determined by visibility: public → sent, others → new
    videoType,
    youtubePrivacyStatus: youtubeVideo.privacyStatus,
    visibilityUpdatedAt: Timestamp.now(),
  }
}

/**
 * Interface for video data from Firestore (raw document).
 */
interface FirestoreVideoRaw {
  id: string
  status?: VideoStatus
  youtubePrivacyStatus?: YouTubePrivacyStatus
  transcriptionSRT?: string
  transcriptionTXT?: string
}

/**
 * Result of fetching transcription for a video.
 */
interface TranscriptionResult {
  videoId: string
  srt: string | null
  txt: string | null
  success: boolean
}

/**
 * Fetches Portuguese transcription for a video using YouTube API v3.
 *
 * @param client - YouTube API client
 * @param videoId - Video ID to fetch transcription for
 * @returns TranscriptionResult with SRT and TXT content, or null if not available
 */
async function fetchTranscriptionForVideo(
  client: YouTubeClient,
  videoId: string
): Promise<TranscriptionResult> {
  try {
    const srt = await client.downloadPortugueseCaptions(videoId)

    if (!srt) {
      return { videoId, srt: null, txt: null, success: false }
    }

    const txt = parseSrtToText(srt)
    return { videoId, srt, txt, success: true }
  } catch (error) {
    // Re-throw quota errors for handling at higher level
    if (error instanceof YouTubeAPIError && error.code === 'YOUTUBE_QUOTA') {
      throw error
    }

    log('WARN', 'Failed to fetch transcription for video', {
      videoId,
      error: error instanceof Error ? error.message : String(error),
    })

    return { videoId, srt: null, txt: null, success: false }
  }
}

/**
 * Fetches transcriptions for multiple videos in batch using YouTube API v3.
 *
 * @param client - YouTube API client
 * @param videoIds - Array of video IDs to fetch transcriptions for
 * @returns Object with transcription results and quota error flag
 */
async function fetchTranscriptionsForVideos(
  client: YouTubeClient,
  videoIds: string[]
): Promise<{ results: TranscriptionResult[]; quotaError: boolean }> {
  const results: TranscriptionResult[] = []
  let quotaError = false

  for (const videoId of videoIds) {
    try {
      const result = await fetchTranscriptionForVideo(client, videoId)
      results.push(result)
    } catch (error) {
      if (error instanceof YouTubeAPIError && error.code === 'YOUTUBE_QUOTA') {
        log('WARN', 'YouTube quota exceeded during transcription fetch', {
          videoId,
          processedCount: results.length,
          remainingCount: videoIds.length - results.length,
        })
        quotaError = true
        break
      }
      // For other errors, add failed result and continue
      results.push({ videoId, srt: null, txt: null, success: false })
    }
  }

  return { results, quotaError }
}

/**
 * Imports new videos from YouTube to Firestore and re-evaluates sent videos.
 *
 * Algorithm:
 * 1. Fetch ALL videos from YouTube (handle pagination)
 * 2. Filter out live broadcasts (live/upcoming are excluded from import)
 * 3. Fetch ALL existing videos from Firestore
 * 4. For NEW videos: create with status based on visibility (public → sent, others → new)
 * 5. For EXISTING sent videos: check if visibility changed to non-public → reopen to draft
 * 6. Fetch transcriptions for new non-public and reopened videos
 *
 * IMPORTANT: Videos are NEVER deleted. Live broadcasts are never imported.
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

  // 2. Fetch all videos from YouTube using podcast's channelId
  const client = new YouTubeClient(accessToken)
  const allYoutubeVideos = await fetchAllYouTubeVideos(client, podcast.channelId)

  // 3. Filter out live broadcasts (they should not be imported)
  const { videos: youtubeVideos, excludedCount: liveBroadcastsExcluded } =
    filterLiveBroadcasts(allYoutubeVideos)

  log('INFO', 'YouTube videos fetched', {
    podcastId,
    channelId: podcast.channelId,
    totalCount: allYoutubeVideos.length,
    afterFilter: youtubeVideos.length,
    liveBroadcastsExcluded,
  })

  // Create lookup map for YouTube videos by ID
  const youtubeVideoMap = new Map(youtubeVideos.map((v) => [v.id, v]))

  // 4. Fetch ALL existing videos from Firestore
  const firestoreVideosRaw = await getAllVideosRaw(podcastId) as FirestoreVideoRaw[]
  const existingVideoMap = new Map(firestoreVideosRaw.map((doc) => [doc.id, doc]))

  log('INFO', 'Firestore videos fetched', {
    podcastId,
    count: existingVideoMap.size,
  })

  // 5. Find NEW videos (in YouTube but not in Firestore)
  const toCreate: VideoCreate[] = []
  let addedAsNew = 0
  let addedAsSent = 0

  for (const ytVideo of youtubeVideos) {
    if (!existingVideoMap.has(ytVideo.id)) {
      const videoType = classifyVideoType(ytVideo.duration, podcast.videoTypes)
      const videoCreate = youtubeToVideoCreate(ytVideo, podcastId, videoType)
      toCreate.push(videoCreate)

      // Track how many were added with each status
      if (videoCreate.status === 'sent') {
        addedAsSent++
      } else {
        addedAsNew++
      }
    }
  }

  // 6. Re-evaluate sent videos - check if visibility changed to non-public
  const toUpdate: { id: string; data: VideoUpdate }[] = []

  for (const fsVideo of firestoreVideosRaw) {
    // Only check videos with 'sent' status
    if (fsVideo.status !== 'sent') continue

    // Find corresponding YouTube video
    const ytVideo = youtubeVideoMap.get(fsVideo.id)
    if (!ytVideo) continue // Video no longer on YouTube, skip

    // Check if visibility changed from public to non-public
    if (ytVideo.privacyStatus !== 'public') {
      // Use state machine to transition sent → draft via 'reopen' action
      const newStatus = transition('sent', 'reopen')

      toUpdate.push({
        id: fsVideo.id,
        data: {
          status: newStatus,
          youtubePrivacyStatus: ytVideo.privacyStatus,
          visibilityUpdatedAt: Timestamp.now(),
        },
      })

      log('INFO', 'Reopening sent video due to visibility change', {
        videoId: fsVideo.id,
        oldVisibility: fsVideo.youtubePrivacyStatus,
        newVisibility: ytVideo.privacyStatus,
        newStatus,
      })
    }
  }

  const skipped = youtubeVideos.length - toCreate.length

  log('INFO', 'Import operations determined', {
    podcastId,
    newVideosAsNew: addedAsNew,
    newVideosAsSent: addedAsSent,
    existingVideos: skipped,
    toReopen: toUpdate.length,
  })

  // 7. Execute batch write for creates and status updates
  if (toCreate.length > 0 || toUpdate.length > 0) {
    await batchWriteVideos(podcastId, {
      creates: toCreate,
      updates: toUpdate,
      deletes: [],
    })
  }

  // 8. Fetch transcriptions for videos that need them
  // - New videos with status 'new' (non-public)
  // - Reopened videos (sent→draft)
  // Limited to MAX_TRANSCRIPTIONS_PER_SYNC per sync to manage quota

  // Collect videos needing transcription with their publishedAt for sorting
  const videosNeedingTranscription: { id: string; publishedAtMs: number }[] = []

  // Add new non-public videos (status = 'new')
  for (const video of toCreate) {
    if (video.status === 'new') {
      // Get publishedAt from YouTube data (ISO string) to avoid Timestamp.toMillis() issues in tests
      const ytVideo = youtubeVideoMap.get(video.id)
      const publishedAtMs = ytVideo
        ? new Date(ytVideo.publishedAt).getTime()
        : Date.now()

      videosNeedingTranscription.push({
        id: video.id,
        publishedAtMs,
      })
    }
  }

  // Add reopened videos (sent→draft) - get publishedAt from YouTube data
  for (const update of toUpdate) {
    const ytVideo = youtubeVideoMap.get(update.id)
    if (ytVideo) {
      videosNeedingTranscription.push({
        id: update.id,
        publishedAtMs: new Date(ytVideo.publishedAt).getTime(),
      })
    }
  }

  // Limit array size before sorting to prevent memory issues with large channels
  // We only need to prioritize the most recent videos anyway
  if (videosNeedingTranscription.length > MAX_VIDEOS_TO_PRIORITIZE) {
    // Pre-filter to keep only the most recent based on publishedAtMs
    videosNeedingTranscription.sort((a, b) => b.publishedAtMs - a.publishedAtMs)
    videosNeedingTranscription.length = MAX_VIDEOS_TO_PRIORITIZE
  } else {
    // Sort by publishedAt descending (most recent first)
    videosNeedingTranscription.sort((a, b) => b.publishedAtMs - a.publishedAtMs)
  }

  const videosToFetchTranscription = videosNeedingTranscription
    .slice(0, MAX_TRANSCRIPTIONS_PER_SYNC)
    .map((v) => v.id)

  let transcriptionsFetched = 0
  let transcriptionsUnavailable = 0
  let quotaError: string | undefined

  if (videosToFetchTranscription.length > 0) {
    log('INFO', 'Fetching transcriptions (limited to most recent)', {
      podcastId,
      totalNeedingTranscription: videosNeedingTranscription.length,
      fetchingCount: videosToFetchTranscription.length,
      maxPerSync: MAX_TRANSCRIPTIONS_PER_SYNC,
    })

    const { results: transcriptionResults, quotaError: hitQuota } =
      await fetchTranscriptionsForVideos(client, videosToFetchTranscription)

    if (hitQuota) {
      quotaError = 'Limite de requisições excedido. Algumas transcrições não foram baixadas.'
    }

    // Prepare updates for videos with transcriptions
    const transcriptionUpdates: { id: string; data: VideoUpdate }[] = []

    for (const result of transcriptionResults) {
      if (result.success && result.srt && result.txt) {
        transcriptionsFetched++
        transcriptionUpdates.push({
          id: result.videoId,
          data: {
            transcriptionSRT: result.srt,
            transcriptionTXT: result.txt,
          },
        })
      } else {
        transcriptionsUnavailable++
      }
    }

    // Execute batch write for transcription updates
    if (transcriptionUpdates.length > 0) {
      await batchWriteVideos(podcastId, {
        creates: [],
        updates: transcriptionUpdates,
        deletes: [],
      })

      log('INFO', 'Transcriptions saved', {
        podcastId,
        count: transcriptionUpdates.length,
      })
    }
  }

  const result: SyncResult = {
    added: addedAsNew,
    addedAsSent,
    skipped,
    reopened: toUpdate.length,
    liveBroadcastsExcluded,
    // Summary fields for UI
    newVideos: toCreate.length,
    reopenedVideos: toUpdate.length,
    transcriptionsFetched,
    transcriptionsUnavailable,
    quotaError,
  }

  log('INFO', 'Video import completed', { podcastId, ...result })

  return result
}
