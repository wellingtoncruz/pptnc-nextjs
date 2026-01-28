/**
 * YouTube Data API v3 client wrapper.
 *
 * Centralizes authentication, retry logic, and error handling for YouTube API calls.
 * Uses Zod schemas from @/lib/schemas/youtube-api for response validation.
 *
 * @see https://developers.google.com/youtube/v3/docs
 */

import type { z } from 'zod'

import { log } from '@/lib/logger'
import {
  YouTubeCaptionsResponseSchema,
  YouTubeChannelsResponseSchema,
  YouTubePlaylistItemsResponseSchema,
  YouTubeVideosResponseSchema,
} from '@/lib/schemas/youtube-api'
import { parseYouTubeDuration } from '@/lib/video-utils'

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'
const MAX_RETRY_ATTEMPTS = 3
const BACKOFF_BASE_MS = 1000

/**
 * Error codes for YouTube API errors.
 */
export type YouTubeErrorCode =
  | 'YOUTUBE_QUOTA'
  | 'YOUTUBE_NOT_FOUND'
  | 'YOUTUBE_FORBIDDEN'
  | 'YOUTUBE_ERROR'
  | 'YOUTUBE_INVALID_RESPONSE'

/**
 * Custom error class for YouTube API errors.
 * Includes error code for programmatic handling and optional HTTP status.
 */
export class YouTubeAPIError extends Error {
  constructor(
    public readonly code: YouTubeErrorCode,
    message: string,
    public readonly status?: number
  ) {
    super(message)
    this.name = 'YouTubeAPIError'
  }
}

/**
 * Video data returned from YouTube API, before Firestore storage.
 * Note: publishedAt is ISO 8601 string from API, converted to Timestamp on save.
 */
export interface YouTubeVideoDataFromAPI {
  id: string
  title: string
  description: string
  thumbnail: string
  duration: number // seconds (converted from ISO 8601)
  publishedAt: string // ISO 8601 datetime
  privacyStatus: 'public' | 'unlisted' | 'private'
  /** Live broadcast status: 'live', 'upcoming', or 'none' */
  liveBroadcastContent: 'live' | 'upcoming' | 'none'
}

/**
 * Result from listVideos() method.
 */
export interface ListVideosResult {
  videos: YouTubeVideoDataFromAPI[]
  nextPageToken?: string
}

/**
 * Options for listVideos() method.
 */
export interface ListVideosOptions {
  /** Maximum videos to return per page (default: 50, max: 50) */
  maxResults?: number
  /** Page token for pagination (from previous response) */
  pageToken?: string
  /**
   * YouTube channel ID to fetch videos from.
   * If provided, fetches from this channel's uploads playlist.
   * If not provided, uses mine=true (authenticated user's channel).
   */
  channelId?: string
}

/**
 * Caption data returned from YouTube API.
 */
export interface YouTubeCaptionData {
  id: string
  language: string
  trackKind: string // 'standard', 'ASR', 'forced', or other values
  name?: string
}

/**
 * YouTube Data API v3 client.
 *
 * Provides methods for fetching channel info, playlist items, and video details.
 * All responses are validated with Zod schemas before returning.
 *
 * @example
 * const client = new YouTubeClient(accessToken)
 * const { videos, nextPageToken } = await client.listVideos({ channelId: 'UC...' })
 */
export class YouTubeClient {
  constructor(private readonly accessToken: string) {}

  /**
   * Converts a YouTube channel ID to its uploads playlist ID.
   * Channel IDs start with "UC", uploads playlists start with "UU".
   *
   * @param channelId - YouTube channel ID (e.g., "UCOvTsuQyJq-fpydse7BY2PQ")
   * @returns Uploads playlist ID (e.g., "UUOvTsuQyJq-fpydse7BY2PQ")
   */
  static channelIdToUploadsPlaylist(channelId: string): string {
    if (!channelId.startsWith('UC')) {
      throw new YouTubeAPIError('YOUTUBE_ERROR', `Invalid channel ID format: ${channelId}. Expected to start with "UC"`)
    }
    return 'UU' + channelId.substring(2)
  }

  /**
   * Makes a request to YouTube API with retry and error handling.
   *
   * @param endpoint - API endpoint (starting with /)
   * @param schema - Zod schema for response validation
   * @param retries - Number of retry attempts (default: 3)
   * @returns Validated response data
   * @throws YouTubeAPIError on API errors or validation failures
   */
  private async fetch<T>(
    endpoint: string,
    schema: z.ZodSchema<T>,
    retries = MAX_RETRY_ATTEMPTS
  ): Promise<T> {
    const url = `${YOUTUBE_API_BASE}${endpoint}`

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          await this.handleErrorResponse(response)
        }

        const data = await response.json()

        // Rule #2: Validate with Zod before returning
        const result = schema.safeParse(data)
        if (!result.success) {
          log('ERROR', 'YouTube API response validation failed', {
            endpoint,
            errors: result.error.issues,
          })
          throw new YouTubeAPIError('YOUTUBE_INVALID_RESPONSE', 'Invalid response format from YouTube API')
        }

        return result.data
      } catch (error) {
        // Don't retry on YouTubeAPIError (business errors)
        if (error instanceof YouTubeAPIError) {
          throw error
        }

        // Retry on network errors
        if (attempt < retries - 1) {
          const delay = BACKOFF_BASE_MS * Math.pow(2, attempt)
          log('WARN', 'YouTube API request failed, retrying', {
            endpoint,
            attempt: attempt + 1,
            maxRetries: retries,
            delayMs: delay,
            error: error instanceof Error ? error.message : String(error),
          })
          await this.sleep(delay)
          continue
        }

        throw error
      }
    }

    // This should never be reached due to throw in the loop
    throw new Error('Unreachable')
  }

  /**
   * Handles error responses from YouTube API.
   * Maps HTTP status codes to YouTubeAPIError codes.
   *
   * @param response - Fetch Response object
   * @throws YouTubeAPIError with appropriate code
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const body = await response.json().catch(() => ({}))
    const reason = body?.error?.errors?.[0]?.reason

    log('WARN', 'YouTube API error response', {
      status: response.status,
      reason,
      body,
    })

    if (response.status === 403) {
      if (reason === 'quotaExceeded') {
        throw new YouTubeAPIError('YOUTUBE_QUOTA', 'YouTube API quota exceeded', 403)
      }
      throw new YouTubeAPIError('YOUTUBE_FORBIDDEN', 'Access to YouTube resource forbidden', 403)
    }

    if (response.status === 404) {
      throw new YouTubeAPIError('YOUTUBE_NOT_FOUND', 'YouTube resource not found', 404)
    }

    throw new YouTubeAPIError(
      'YOUTUBE_ERROR',
      `YouTube API error: ${response.status}`,
      response.status
    )
  }

  /**
   * Sleep utility for retry backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Gets the uploads playlist ID for the authenticated user's channel.
   *
   * Calls channels.list with mine=true to get the user's channel,
   * then extracts the uploads playlist ID from relatedPlaylists.
   *
   * @returns Uploads playlist ID (starts with UU)
   * @throws YouTubeAPIError if channel not found or API error
   */
  async getUploadsPlaylistId(): Promise<string> {
    const data = await this.fetch(
      '/channels?mine=true&part=contentDetails',
      YouTubeChannelsResponseSchema
    )

    if (!data.items.length) {
      throw new YouTubeAPIError('YOUTUBE_NOT_FOUND', 'No YouTube channel found for authenticated user')
    }

    return data.items[0].contentDetails.relatedPlaylists.uploads
  }

  /**
   * Lists video IDs from a playlist.
   *
   * @param playlistId - Playlist ID (e.g., uploads playlist)
   * @param maxResults - Maximum results per page (default: 50, max: 50)
   * @param pageToken - Page token for pagination
   * @returns Object with videoIds array and optional nextPageToken
   */
  async listPlaylistItems(
    playlistId: string,
    maxResults = 50,
    pageToken?: string
  ): Promise<{ videoIds: string[]; nextPageToken?: string }> {
    let endpoint = `/playlistItems?playlistId=${playlistId}&part=snippet&maxResults=${maxResults}`
    if (pageToken) {
      endpoint += `&pageToken=${pageToken}`
    }

    const data = await this.fetch(endpoint, YouTubePlaylistItemsResponseSchema)

    const videoIds = data.items.map((item) => item.snippet.resourceId.videoId)
    return { videoIds, nextPageToken: data.nextPageToken }
  }

  /**
   * Gets detailed video information.
   *
   * @param videoIds - Array of video IDs
   * @returns Array of video data with parsed duration and privacy status
   */
  async getVideoDetails(videoIds: string[]): Promise<YouTubeVideoDataFromAPI[]> {
    if (videoIds.length === 0) {
      return []
    }

    const ids = videoIds.join(',')
    const data = await this.fetch(
      `/videos?id=${ids}&part=snippet,contentDetails,status`,
      YouTubeVideosResponseSchema
    )

    return data.items.map((item) => ({
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail:
        item.snippet.thumbnails.high?.url ||
        item.snippet.thumbnails.medium?.url ||
        item.snippet.thumbnails.default?.url ||
        '',
      duration: parseYouTubeDuration(item.contentDetails.duration),
      publishedAt: item.snippet.publishedAt,
      privacyStatus: item.status?.privacyStatus ?? 'public',
      liveBroadcastContent: (item.snippet.liveBroadcastContent as 'live' | 'upcoming' | 'none') ?? 'none',
    }))
  }

  /**
   * Lists videos from a YouTube channel.
   *
   * Orchestrates the YouTube API flow:
   * 1. Get uploads playlist ID (from channelId or mine=true)
   * 2. playlistItems.list → get video IDs
   * 3. videos.list → get video details
   *
   * @param options - Options including maxResults, pageToken, and channelId
   * @returns Object with videos array and optional nextPageToken
   *
   * @example
   * const client = new YouTubeClient(accessToken)
   *
   * // Using specific channel (recommended for multi-tenant):
   * const { videos } = await client.listVideos({ channelId: 'UCOvTsuQyJq-fpydse7BY2PQ' })
   *
   * // Using authenticated user's channel (legacy):
   * const { videos } = await client.listVideos({})
   *
   * // With pagination:
   * const page2 = await client.listVideos({ channelId, pageToken: nextPageToken })
   */
  async listVideos(options: ListVideosOptions = {}): Promise<ListVideosResult> {
    const { maxResults = 50, pageToken, channelId } = options

    log('INFO', 'Listing YouTube videos', { maxResults, pageToken, channelId: channelId || 'mine' })

    // Get uploads playlist ID - either from channelId or mine=true
    const uploadsPlaylistId = channelId
      ? YouTubeClient.channelIdToUploadsPlaylist(channelId)
      : await this.getUploadsPlaylistId()

    const { videoIds, nextPageToken } = await this.listPlaylistItems(
      uploadsPlaylistId,
      maxResults,
      pageToken
    )

    const videos = await this.getVideoDetails(videoIds)

    log('INFO', 'YouTube videos listed successfully', {
      count: videos.length,
      hasMore: !!nextPageToken,
      channelId: channelId || 'mine',
    })

    return { videos, nextPageToken }
  }

  /**
   * Lists caption tracks for a video.
   *
   * @param videoId - YouTube video ID
   * @returns Array of caption tracks
   *
   * @example
   * const client = new YouTubeClient(accessToken)
   * const captions = await client.listCaptions('dQw4w9WgXcQ')
   * const ptCaptions = captions.filter(c => c.language.startsWith('pt'))
   */
  async listCaptions(videoId: string): Promise<YouTubeCaptionData[]> {
    log('INFO', 'Listing captions for video', { videoId })

    const data = await this.fetch(
      `/captions?part=snippet&videoId=${videoId}`,
      YouTubeCaptionsResponseSchema
    )

    const captions = data.items.map((item) => ({
      id: item.id,
      language: item.snippet.language,
      trackKind: item.snippet.trackKind,
      name: item.snippet.name,
    }))

    log('INFO', 'Captions listed successfully', {
      videoId,
      count: captions.length,
      languages: captions.map((c) => c.language),
    })

    return captions
  }

  /**
   * Downloads caption track content in SRT format.
   *
   * @param captionId - Caption track ID (from listCaptions)
   * @returns SRT content as string
   *
   * @example
   * const client = new YouTubeClient(accessToken)
   * const srt = await client.downloadCaption('caption-id-here')
   */
  async downloadCaption(captionId: string): Promise<string> {
    log('INFO', 'Downloading caption', { captionId })

    const url = `${YOUTUBE_API_BASE}/captions/${captionId}?tfmt=srt`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (!response.ok) {
      await this.handleErrorResponse(response)
    }

    const srtContent = await response.text()

    log('INFO', 'Caption downloaded successfully', {
      captionId,
      contentLength: srtContent.length,
    })

    return srtContent
  }

  /**
   * Finds and downloads Portuguese (PT/PT-BR) auto-generated captions.
   *
   * Prioritizes:
   * 1. PT-BR ASR (auto-generated)
   * 2. PT ASR (auto-generated)
   *
   * @param videoId - YouTube video ID
   * @returns SRT content if found, null if no PT captions available
   *
   * @example
   * const client = new YouTubeClient(accessToken)
   * const srt = await client.downloadPortugueseCaptions('video-id')
   * if (srt) {
   *   // Process SRT content
   * }
   */
  async downloadPortugueseCaptions(videoId: string): Promise<string | null> {
    const captions = await this.listCaptions(videoId)

    // Helper to check if trackKind is ASR (case-insensitive)
    const isASR = (trackKind: string) => trackKind.toUpperCase() === 'ASR'

    // Find PT-BR or PT auto-generated captions
    const ptBrAsr = captions.find(
      (c) => c.language === 'pt-BR' && isASR(c.trackKind)
    )
    const ptAsr = captions.find(
      (c) => c.language === 'pt' && isASR(c.trackKind)
    )

    const targetCaption = ptBrAsr || ptAsr

    if (!targetCaption) {
      log('INFO', 'No Portuguese ASR captions found', {
        videoId,
        availableLanguages: captions.map((c) => `${c.language}:${c.trackKind}`),
      })
      return null
    }

    log('INFO', 'Found Portuguese caption', {
      videoId,
      language: targetCaption.language,
      trackKind: targetCaption.trackKind,
    })

    return this.downloadCaption(targetCaption.id)
  }
}
