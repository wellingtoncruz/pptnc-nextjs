/**
 * YouTube API client module.
 *
 * Provides YouTubeClient for interacting with YouTube Data API v3.
 *
 * @example
 * import { YouTubeClient, YouTubeAPIError } from '@/lib/youtube'
 *
 * const client = new YouTubeClient(accessToken)
 * try {
 *   const { videos } = await client.listVideos()
 * } catch (error) {
 *   if (error instanceof YouTubeAPIError) {
 *     console.log(error.code) // 'YOUTUBE_QUOTA' | 'YOUTUBE_NOT_FOUND' | etc.
 *   }
 * }
 */

export { YouTubeAPIError, YouTubeClient } from './client'
export type { ListVideosOptions, ListVideosResult, YouTubeCaptionData, YouTubeErrorCode, YouTubeVideoDataFromAPI } from './client'
export { formatChaptersForYouTube, buildDescriptionWithChapters } from './format-chapters'
export type { Chapter } from './format-chapters'
