import { z } from 'zod'

/**
 * YouTube API Thumbnail schema.
 */
export const YouTubeThumbnailSchema = z.object({
  url: z.string().url(),
  width: z.number().optional(),
  height: z.number().optional(),
})

/**
 * YouTube API Thumbnails schema - all available thumbnail sizes.
 */
export const YouTubeThumbnailsSchema = z.object({
  default: YouTubeThumbnailSchema.optional(),
  medium: YouTubeThumbnailSchema.optional(),
  high: YouTubeThumbnailSchema.optional(),
  standard: YouTubeThumbnailSchema.optional(),
  maxres: YouTubeThumbnailSchema.optional(),
})

/**
 * YouTube API Snippet schema - video metadata from YouTube.
 */
export const YouTubeSnippetSchema = z.object({
  title: z.string(),
  description: z.string(),
  publishedAt: z.string(), // ISO 8601 datetime string
  channelId: z.string(),
  channelTitle: z.string().optional(),
  thumbnails: YouTubeThumbnailsSchema,
  tags: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
  liveBroadcastContent: z.string().optional(),
})

/**
 * YouTube API Content Details schema - video duration and other details.
 */
export const YouTubeContentDetailsSchema = z.object({
  duration: z.string(), // ISO 8601 duration: PT1H2M3S
  dimension: z.string().optional(),
  definition: z.string().optional(),
  caption: z.string().optional(),
  licensedContent: z.boolean().optional(),
  projection: z.string().optional(),
})

/**
 * YouTube API Status schema - video status including privacy.
 *
 * @see https://developers.google.com/youtube/v3/docs/videos#status
 */
export const YouTubeStatusSchema = z.object({
  uploadStatus: z.string().optional(),
  privacyStatus: z.enum(['public', 'unlisted', 'private']),
  license: z.string().optional(),
  embeddable: z.boolean().optional(),
  publicStatsViewable: z.boolean().optional(),
  madeForKids: z.boolean().optional(),
})

/**
 * YouTube Video Item schema - single video from YouTube API response.
 *
 * Represents a single item from the videos.list endpoint.
 * @see https://developers.google.com/youtube/v3/docs/videos
 */
export const YouTubeVideoItemSchema = z.object({
  kind: z.literal('youtube#video').optional(),
  etag: z.string().optional(),
  id: z.string(),
  snippet: YouTubeSnippetSchema,
  contentDetails: YouTubeContentDetailsSchema,
  status: YouTubeStatusSchema.optional(),
})

/**
 * YouTube Videos List Response schema - paginated list of videos.
 *
 * Response from videos.list endpoint.
 * @see https://developers.google.com/youtube/v3/docs/videos/list
 */
export const YouTubeVideosResponseSchema = z.object({
  kind: z.literal('youtube#videoListResponse').optional(),
  etag: z.string().optional(),
  items: z.array(YouTubeVideoItemSchema),
  nextPageToken: z.string().optional(),
  prevPageToken: z.string().optional(),
  pageInfo: z
    .object({
      totalResults: z.number(),
      resultsPerPage: z.number(),
    })
    .optional(),
})

/**
 * YouTube Playlist Item schema - single item from a playlist.
 *
 * Used when fetching videos from channel uploads playlist.
 * @see https://developers.google.com/youtube/v3/docs/playlistItems
 */
export const YouTubePlaylistItemSchema = z.object({
  kind: z.literal('youtube#playlistItem').optional(),
  etag: z.string().optional(),
  id: z.string(),
  snippet: z.object({
    publishedAt: z.string(),
    channelId: z.string(),
    title: z.string(),
    description: z.string(),
    thumbnails: YouTubeThumbnailsSchema,
    channelTitle: z.string().optional(),
    playlistId: z.string(),
    position: z.number(),
    resourceId: z.object({
      kind: z.string(),
      videoId: z.string(),
    }),
  }),
  contentDetails: z
    .object({
      videoId: z.string(),
      videoPublishedAt: z.string().optional(),
    })
    .optional(),
})

/**
 * YouTube Playlist Items Response schema - paginated list of playlist items.
 *
 * Response from playlistItems.list endpoint.
 * @see https://developers.google.com/youtube/v3/docs/playlistItems/list
 */
export const YouTubePlaylistItemsResponseSchema = z.object({
  kind: z.literal('youtube#playlistItemListResponse').optional(),
  etag: z.string().optional(),
  items: z.array(YouTubePlaylistItemSchema),
  nextPageToken: z.string().optional(),
  prevPageToken: z.string().optional(),
  pageInfo: z
    .object({
      totalResults: z.number(),
      resultsPerPage: z.number(),
    })
    .optional(),
})

/**
 * YouTube Channel Content Details schema - includes uploads playlist ID.
 */
export const YouTubeChannelContentDetailsSchema = z.object({
  relatedPlaylists: z.object({
    likes: z.string().optional(),
    uploads: z.string(), // This is the uploads playlist ID (UU...)
  }),
})

/**
 * YouTube Channel Item schema - channel information.
 *
 * @see https://developers.google.com/youtube/v3/docs/channels
 */
export const YouTubeChannelItemSchema = z.object({
  kind: z.literal('youtube#channel').optional(),
  etag: z.string().optional(),
  id: z.string(),
  contentDetails: YouTubeChannelContentDetailsSchema,
})

/**
 * YouTube Channels Response schema - channel list response.
 *
 * Response from channels.list endpoint.
 * @see https://developers.google.com/youtube/v3/docs/channels/list
 */
export const YouTubeChannelsResponseSchema = z.object({
  kind: z.literal('youtube#channelListResponse').optional(),
  etag: z.string().optional(),
  items: z.array(YouTubeChannelItemSchema),
  pageInfo: z
    .object({
      totalResults: z.number(),
      resultsPerPage: z.number(),
    })
    .optional(),
})
