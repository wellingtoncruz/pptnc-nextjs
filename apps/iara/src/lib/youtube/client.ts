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
}

/**
 * Result from listVideos() method.
 */
export interface ListVideosResult {
  videos: YouTubeVideoDataFromAPI[]
  nextPageToken?: string
}

/**
 * YouTube Data API v3 client.
 *
 * Provides methods for fetching channel info, playlist items, and video details.
 * All responses are validated with Zod schemas before returning.
 *
 * @example
 * const client = new YouTubeClient(accessToken)
 * const { videos, nextPageToken } = await client.listVideos(50)
 */
export class YouTubeClient {
  constructor(private readonly accessToken: string) {}

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
            errors: result.error.errors,
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
   * @returns Array of video data with parsed duration
   */
  async getVideoDetails(videoIds: string[]): Promise<YouTubeVideoDataFromAPI[]> {
    if (videoIds.length === 0) {
      return []
    }

    const ids = videoIds.join(',')
    const data = await this.fetch(
      `/videos?id=${ids}&part=snippet,contentDetails`,
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
    }))
  }

  /**
   * Lists videos from the authenticated user's channel.
   *
   * Orchestrates the YouTube API flow:
   * 1. channels.list → get uploads playlist ID
   * 2. playlistItems.list → get video IDs
   * 3. videos.list → get video details
   *
   * @param maxResults - Maximum videos to return (default: 50, max: 50)
   * @param pageToken - Page token for pagination (from previous response)
   * @returns Object with videos array and optional nextPageToken
   *
   * @example
   * const client = new YouTubeClient(accessToken)
   * const { videos, nextPageToken } = await client.listVideos(50)
   *
   * // For next page:
   * const page2 = await client.listVideos(50, nextPageToken)
   */
  async listVideos(maxResults = 50, pageToken?: string): Promise<ListVideosResult> {
    log('INFO', 'Listing YouTube videos', { maxResults, pageToken })

    const uploadsPlaylistId = await this.getUploadsPlaylistId()
    const { videoIds, nextPageToken } = await this.listPlaylistItems(
      uploadsPlaylistId,
      maxResults,
      pageToken
    )

    const videos = await this.getVideoDetails(videoIds)

    log('INFO', 'YouTube videos listed successfully', {
      count: videos.length,
      hasMore: !!nextPageToken,
    })

    return { videos, nextPageToken }
  }
}
