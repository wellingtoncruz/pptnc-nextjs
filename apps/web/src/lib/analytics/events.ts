/**
 * Analytics event tracking functions
 * Custom events for tracking user interactions with the podcast platform
 */

import { event, isGAEnabled } from "./gtag";
import { formatTimestamp } from "@/lib/transcript";

/**
 * Source of timestamp click for analytics categorization
 */
export type TimestampClickSource = "transcript" | "chapters" | "related" | "share";

/**
 * Checks if the user has enabled Do Not Track in their browser
 * Respects user privacy preferences as a fallback when no consent management is in place
 */
function isDoNotTrackEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.doNotTrack === "1";
}

/**
 * Tracks when a user clicks on a timestamp to seek the video
 * This helps understand which moments in episodes are most engaging
 *
 * Privacy: Respects Do Not Track browser setting
 * Performance: Non-blocking, gtag batches events automatically
 *
 * @param episodeId - YouTube video ID of the episode
 * @param seconds - Timestamp position in seconds
 * @param source - Where the click originated from (transcript, related, share)
 *
 * @example
 * trackTimestampClick("abc123xyz", 754, "transcript");
 * // Sends: { episode_id: "abc123xyz", timestamp_seconds: 754, timestamp_formatted: "12:34", click_source: "transcript" }
 */
export function trackTimestampClick(
  episodeId: string,
  seconds: number,
  source: TimestampClickSource = "transcript"
): void {
  // Respect Do Not Track browser preference
  if (isDoNotTrackEnabled()) {
    return;
  }

  // Check if GA is enabled and ready
  if (!isGAEnabled()) {
    return;
  }

  event("timestamp_click", {
    episode_id: episodeId,
    timestamp_seconds: seconds,
    timestamp_formatted: formatTimestamp(seconds),
    click_source: source,
  });
}
