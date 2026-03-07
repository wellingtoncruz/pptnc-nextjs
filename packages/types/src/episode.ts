import type { Guest, GuestEntity } from "./guest";

/**
 * YouTube thumbnail image data
 */
export interface EpisodeThumbnail {
  /** Thumbnail URL */
  url: string;
  /** Thumbnail width in pixels */
  width: number;
  /** Thumbnail height in pixels */
  height: number;
}

/**
 * Collection of YouTube thumbnails in different resolutions
 */
export interface EpisodeThumbnails {
  /** Default thumbnail (120x90) */
  default: EpisodeThumbnail;
  /** Medium thumbnail (320x180) */
  medium: EpisodeThumbnail;
  /** High quality thumbnail (480x360) */
  high: EpisodeThumbnail;
}

/**
 * YouTube video statistics
 */
export interface EpisodeStatistics {
  /** Number of comments */
  commentCount: string;
  /** Number of favorites */
  favoriteCount: string;
  /** Number of views */
  viewCount: string;
  /** Number of likes */
  likeCount: string;
}

/**
 * YouTube video content details
 */
export interface EpisodeContentDetails {
  /** Whether captions are available */
  caption: string;
  /** Video dimension (2d/3d) */
  dimension: string;
  /** ISO 8601 duration (e.g., "PT9M56S") */
  duration: string;
  /** Video definition (hd/sd) */
  definition: string;
  /** Content rating information */
  contentRating: Record<string, unknown>;
  /** Video projection type */
  projection: string;
  /** Whether content is licensed */
  licensedContent: boolean;
}

/**
 * Represents a podcast episode with all its metadata
 * Combines actual Datastore fields with derived/future fields
 */
export interface Episode {
  /** Unique identifier for the episode (Firestore document ID = YouTube video ID) */
  id: string;
  /** URL-friendly slug for the episode (future field, derived from title if not present) */
  slug: string;
  /** Episode title */
  title: string;
  /** Episode description/summary */
  description: string;
  /** Publication date */
  publishedAt: Date;
  /** Episode duration in seconds */
  duration: number;
  /** YouTube video ID for embedding */
  youtubeId: string;
  /** Thumbnail images in different resolutions */
  thumbnails: EpisodeThumbnails;
  /** Convenience: High quality thumbnail URL */
  thumbnailUrl: string;
  /** Plain text transcript */
  transcript?: string;
  /** SRT formatted transcript with timestamps */
  transcriptSrt?: string;
  /** YouTube channel ID */
  channelId: string;
  /** YouTube channel title */
  channelTitle: string;
  /** YouTube playlist ID */
  playlistId: string;
  /** Position in playlist */
  position: number;
  /** Video statistics (views, likes, comments) */
  statistics: EpisodeStatistics;
  /** Video content details */
  contentDetails: EpisodeContentDetails;
  /** Spotify episode URL (future field) */
  spotifyUrl?: string;
  /** Direct audio file URL (future field) */
  audioUrl?: string;
  /** List of guests who appeared on this episode */
  guests: Guest[];
  /** List of topic slugs associated with this episode */
  topics: string[];
}

/**
 * Episode data as returned from Datastore (raw entity)
 * Field names match actual Datastore schema
 */
export interface EpisodeEntity {
  /** Episode title */
  title: string;
  /** Episode description */
  description: string;
  /** Publication date as ISO string */
  publishedAt: string | Date | number;
  /** Duration in seconds */
  duration: number;
  /** YouTube playlist ID */
  playlistId: string;
  /** Plain text transcript */
  transcriptionTXT?: string;
  /** SRT formatted transcript */
  transcriptionSRT?: string;
  /** Thumbnail images object */
  thumbnails: EpisodeThumbnails;
  /** Video statistics */
  statistics: EpisodeStatistics;
  /** Video content details */
  contentDetails: EpisodeContentDetails;
  /** Channel ID */
  channelId: string;
  /** Channel title */
  channelTitle: string;
  /** Video owner channel ID */
  videoOwnerChannelId: string;
  /** Video owner channel title */
  videoOwnerChannelTitle: string;
  /** Position in playlist */
  position: number;
  // Future fields (optional)
  /** URL-friendly slug (future) */
  slug?: string;
  /** Spotify URL (future) */
  spotifyUrl?: string;
  /** Audio URL (future) */
  audioUrl?: string;
  /** Guest list */
  guests?: GuestEntity[];
  /** Topic tags */
  topics?: string[];
  /** Video type classification (set by IAra backoffice) */
  videoType?: 'episode' | 'cut' | 'reel';
  /** Thumbnail stored in Firebase Storage (works for private/scheduled videos) */
  storageThumbnailUrl?: string;
}
