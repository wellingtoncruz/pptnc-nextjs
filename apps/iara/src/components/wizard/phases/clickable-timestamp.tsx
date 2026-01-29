'use client'

import { cn } from '@/lib/utils'
import { useYouTubeOptional } from '../youtube-context'

/**
 * Context offset in seconds.
 *
 * When clicking a timestamp, the video seeks to this many seconds BEFORE
 * the actual timestamp. This gives reviewers context to understand
 * what was happening before the flagged moment.
 *
 * @pattern TIMESTAMP_CONTEXT_OFFSET - Always seek 30s before the flagged timestamp
 */
export const TIMESTAMP_CONTEXT_OFFSET_SECONDS = 30

interface ClickableTimestampProps {
  /** YouTube video ID (kept for backwards compatibility, not used with in-page player) */
  videoId: string
  /** Timestamp string in "HH:MM:SS" or "MM:SS" format */
  timestamp: string
  /** Optional additional class names */
  className?: string
  /**
   * Whether to apply context offset when seeking.
   * When true (default), seeks to timestamp - 30s for context.
   * When false, seeks to exact timestamp (useful for chapters).
   */
  applyContextOffset?: boolean
}

/**
 * Parse a timestamp string to total seconds.
 *
 * Supports formats:
 * - "MM:SS" (e.g., "05:30" = 330 seconds)
 * - "HH:MM:SS" (e.g., "01:05:30" = 3930 seconds)
 *
 * @param timestamp - Timestamp string
 * @returns Total seconds, or 0 if parsing fails
 */
export function parseTimestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number)

  // Validate all parts are numbers
  if (parts.some(isNaN)) {
    return 0
  }

  if (parts.length === 2) {
    // MM:SS
    const [minutes, seconds] = parts
    return minutes * 60 + seconds
  } else if (parts.length === 3) {
    // HH:MM:SS
    const [hours, minutes, seconds] = parts
    return hours * 3600 + minutes * 60 + seconds
  }

  return 0
}

/**
 * Generate a YouTube URL with a timestamp parameter.
 *
 * @deprecated Use in-page seekTo instead. This is kept for backwards compatibility.
 * @param videoId - YouTube video ID
 * @param timestamp - Timestamp string
 * @returns YouTube URL with ?t= parameter
 */
export function getYouTubeTimestampUrl(videoId: string, timestamp: string): string {
  const seconds = parseTimestampToSeconds(timestamp)
  return `https://youtu.be/${videoId}?t=${seconds}`
}

/**
 * Clickable timestamp that seeks the in-page YouTube player to a specific time.
 *
 * Uses YouTubeContext to control the in-page video player instead of
 * opening a new browser tab. This provides a better UX as users stay
 * on the same page.
 *
 * When clicked:
 * 1. Seeks the video to the specified timestamp (with optional -30s context offset)
 * 2. Scrolls the video player into view if needed
 *
 * ## Context Offset Pattern
 *
 * By default, timestamps seek to 30 seconds BEFORE the flagged moment.
 * This gives reviewers audio/video context to understand what was happening
 * before the issue. The displayed timestamp remains unchanged.
 *
 * Set `applyContextOffset={false}` for timestamps that should seek to exact
 * positions (e.g., chapter markers).
 *
 * @pattern TIMESTAMP_SEEK_IN_PAGE - Timestamps control in-page player, not external links
 * @pattern TIMESTAMP_CONTEXT_OFFSET - Seek 30s before flagged timestamp for context
 * @see youtube-context.tsx - Context provider for player state
 * @see portal-web/timestamp-link.tsx - Original implementation
 *
 * @example
 * // With context offset (default) - seeks to 5:00 when clicked
 * <ClickableTimestamp videoId="abc123" timestamp="05:30" />
 *
 * @example
 * // Without context offset - seeks to exact 05:30
 * <ClickableTimestamp videoId="abc123" timestamp="05:30" applyContextOffset={false} />
 */
export function ClickableTimestamp({
  videoId: _videoId, // Kept for API compatibility, not used
  timestamp,
  className,
  applyContextOffset = true,
}: ClickableTimestampProps) {
  const youtube = useYouTubeOptional()
  const seconds = parseTimestampToSeconds(timestamp)

  // Apply context offset: seek 30s before the flagged timestamp for context
  // Never go below 0 seconds
  const seekSeconds = applyContextOffset
    ? Math.max(0, seconds - TIMESTAMP_CONTEXT_OFFSET_SECONDS)
    : seconds

  const handleClick = () => {
    // Seek video to calculated position
    if (youtube) {
      youtube.seekTo(seekSeconds)

      // Scroll video into view smoothly
      const videoContainer = document.querySelector('[data-youtube-player]')
      if (videoContainer) {
        videoContainer.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'font-mono text-sm tabular-nums',
        'text-primary hover:text-primary/80 hover:underline',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'transition-colors',
        className
      )}
      aria-label={`Ir para ${timestamp} no vídeo`}
    >
      {timestamp}
    </button>
  )
}
