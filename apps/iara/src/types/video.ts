import type { z } from 'zod'

import type {
  VideoSchema,
  VideoCreateSchema,
  VideoUpdateSchema,
  VideoTypeSchema,
  VideoStatusSchema,
  YouTubePrivacyStatusSchema,
  ChapterSchema,
  ComplianceSchema,
  ComplianceItemSchema,
  VideoSummarySchema,
  ThumbnailsSchema,
  ThumbnailItemSchema,
  StatisticsSchema,
  GuestSchema,
  EpisodeContextFormSchema,
} from '@/lib/schemas/video'

import type {
  YouTubeVideoItemSchema,
  YouTubeVideosResponseSchema,
  YouTubePlaylistItemSchema,
  YouTubePlaylistItemsResponseSchema,
  YouTubeChannelItemSchema,
  YouTubeChannelsResponseSchema,
} from '@/lib/schemas/youtube-api'

/**
 * Full video document type.
 *
 * Uses FLAT structure compatible with portal-web/EpisodeEntity.
 * IAra extends this with additional fields (status, videoType, generatedTitle, etc.)
 */
export type Video = z.infer<typeof VideoSchema>

/**
 * Input for creating/syncing a video document.
 */
export type VideoCreate = z.infer<typeof VideoCreateSchema>

/**
 * Input for updating video fields.
 */
export type VideoUpdate = z.infer<typeof VideoUpdateSchema>

/**
 * Video type classification.
 */
export type VideoType = z.infer<typeof VideoTypeSchema>

/**
 * Filter type for video list queries.
 * Includes all video types plus 'all' for no filtering.
 */
export type VideoTypeFilter = VideoType | 'all'

/**
 * Video status in the lifecycle.
 */
export type VideoStatus = z.infer<typeof VideoStatusSchema>

/**
 * YouTube privacy status.
 */
export type YouTubePrivacyStatus = z.infer<typeof YouTubePrivacyStatusSchema>

/**
 * Chapter marker in video.
 */
export type Chapter = z.infer<typeof ChapterSchema>

/**
 * Compliance check result.
 */
export type Compliance = z.infer<typeof ComplianceSchema>

/**
 * Single compliance issue.
 */
export type ComplianceItem = z.infer<typeof ComplianceItemSchema>

/**
 * VideoSummary - minimal fields for list display.
 *
 * Used in VideoListItem component for efficient list rendering.
 */
export type VideoSummary = z.infer<typeof VideoSummarySchema>

/**
 * VideoDetail - all fields for detailed display.
 *
 * Used in VideoDetailPanel component. Alias for full Video type.
 */
export type VideoDetail = Video

/**
 * Thumbnails object with different resolutions.
 */
export type Thumbnails = z.infer<typeof ThumbnailsSchema>

/**
 * Single thumbnail item.
 */
export type ThumbnailItem = z.infer<typeof ThumbnailItemSchema>

/**
 * Statistics object.
 */
export type Statistics = z.infer<typeof StatisticsSchema>

/**
 * Guest - represents a guest or co-host.
 * Legacy structure compatible with portal-web.
 * Co-host (when present) is stored as guests[0].
 */
export type Guest = z.infer<typeof GuestSchema>

/**
 * Episode context form data - for UI form only.
 * On save, coHost is inserted as guests[0] if present.
 */
export type EpisodeContextFormData = z.infer<typeof EpisodeContextFormSchema>

// YouTube API Response Types

/**
 * YouTube video item from API.
 */
export type YouTubeVideoItem = z.infer<typeof YouTubeVideoItemSchema>

/**
 * YouTube videos list response.
 */
export type YouTubeVideosResponse = z.infer<typeof YouTubeVideosResponseSchema>

/**
 * YouTube playlist item from API.
 */
export type YouTubePlaylistItem = z.infer<typeof YouTubePlaylistItemSchema>

/**
 * YouTube playlist items response.
 */
export type YouTubePlaylistItemsResponse = z.infer<typeof YouTubePlaylistItemsResponseSchema>

/**
 * YouTube channel item from API.
 */
export type YouTubeChannelItem = z.infer<typeof YouTubeChannelItemSchema>

/**
 * YouTube channels response.
 */
export type YouTubeChannelsResponse = z.infer<typeof YouTubeChannelsResponseSchema>
