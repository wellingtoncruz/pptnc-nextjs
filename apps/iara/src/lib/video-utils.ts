import type { VideoTypesConfig } from '@/types/podcast'
import type { VideoType, Thumbnails } from '@/types/video'

/**
 * Parses YouTube ISO 8601 duration format to seconds.
 *
 * YouTube uses ISO 8601 duration format: PT[H]H[M]M[S]S
 * - PT1H2M3S = 1 hour, 2 minutes, 3 seconds = 3723 seconds
 * - PT5M = 5 minutes = 300 seconds
 * - PT30S = 30 seconds
 * - P0D = 0 (livestream or duration not available)
 *
 * @param iso8601 - Duration string in ISO 8601 format
 * @returns Duration in seconds (0 if invalid format)
 *
 * @example
 * parseYouTubeDuration('PT1H2M3S') // 3723
 * parseYouTubeDuration('PT5M') // 300
 * parseYouTubeDuration('PT30S') // 30
 * parseYouTubeDuration('P0D') // 0 (livestream)
 */
export function parseYouTubeDuration(iso8601: string): number {
  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0

  const hours = parseInt(match[1] || '0', 10)
  const minutes = parseInt(match[2] || '0', 10)
  const seconds = parseInt(match[3] || '0', 10)

  return hours * 3600 + minutes * 60 + seconds
}

/**
 * Classifies video type based on duration.
 *
 * Uses the podcast's videoTypes configuration to determine thresholds:
 * - episode: duration >= config.episode.minDuration
 * - cut: config.cut.minDuration <= duration < config.episode.minDuration
 * - reel: duration < config.cut.minDuration
 *
 * @param durationSeconds - Video duration in seconds
 * @param config - Podcast video types configuration with duration thresholds
 * @returns 'episode' | 'cut' | 'reel'
 *
 * @example
 * // With DEFAULT_VIDEO_TYPES (episode: 1200s, cut: 180s, reel: 0s)
 * classifyVideoType(3600, config) // 'episode' (1 hour)
 * classifyVideoType(600, config)  // 'cut' (10 minutes)
 * classifyVideoType(60, config)   // 'reel' (1 minute)
 */
export function classifyVideoType(
  durationSeconds: number,
  config: VideoTypesConfig
): VideoType {
  if (durationSeconds >= config.episode.minDuration) {
    return 'episode'
  }
  if (durationSeconds >= config.cut.minDuration) {
    return 'cut'
  }
  return 'reel'
}

// ============================================================================
// DURATION FORMATTING
// ============================================================================

/**
 * Formats duration in seconds to a human-readable string.
 *
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "1:23:45" for hours, "23:45" for minutes)
 *
 * @example
 * formatDuration(3723) // "1:02:03"
 * formatDuration(300)  // "5:00"
 * formatDuration(65)   // "1:05"
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

// ============================================================================
// THUMBNAIL UTILITIES
// ============================================================================

/**
 * Gets the best available thumbnail URL from a thumbnails object.
 *
 * Prefers higher resolution: maxres > standard > high > medium > default
 *
 * @param thumbnails - Thumbnails object from video document
 * @returns URL string or empty string if no thumbnail available
 */
export function getBestThumbnailUrl(thumbnails?: Thumbnails): string {
  if (!thumbnails) return ''

  return (
    thumbnails.maxres?.url ??
    thumbnails.standard?.url ??
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url ??
    ''
  )
}

// ============================================================================
// VIDEO TYPE INFERENCE
// ============================================================================

/**
 * Default duration thresholds for video type classification.
 * Used when podcast config is not available.
 */
const DEFAULT_DURATION_THRESHOLDS = {
  episode: 1200, // >= 20 min
  cut: 180, // >= 3 min
}

/**
 * Infers video type from duration when not explicitly set.
 *
 * @param duration - Duration in seconds
 * @returns Inferred video type
 */
export function inferVideoType(duration: number | undefined): VideoType {
  if (!duration || duration <= 0) return 'reel'

  if (duration >= DEFAULT_DURATION_THRESHOLDS.episode) {
    return 'episode'
  }
  if (duration >= DEFAULT_DURATION_THRESHOLDS.cut) {
    return 'cut'
  }
  return 'reel'
}

// ============================================================================
// LEGACY DOCUMENT DETECTION (for incremental migration)
// ============================================================================

/**
 * Checks if a video document needs IAra fields added.
 *
 * Documents without `status` field are considered to need IAra enrichment.
 * This allows sync to incrementally add IAra fields to existing documents.
 *
 * @param data - Raw document data from Firestore
 * @returns true if document needs IAra fields, false if already has them
 */
export function needsIaraFields(data: Record<string, unknown>): boolean {
  return !('status' in data) || !('videoType' in data)
}
