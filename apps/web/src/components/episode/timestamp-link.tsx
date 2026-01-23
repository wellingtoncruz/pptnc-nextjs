"use client";

import { formatTimestamp } from "@/lib/transcript";
import { cn } from "@/lib/utils";
import { useYouTubeOptional } from "./youtube-context";
import {
  trackTimestampClick,
  type TimestampClickSource,
} from "@/lib/analytics";

export interface TimestampLinkProps {
  /** Time in seconds to seek to */
  seconds: number;
  /** Additional CSS classes */
  className?: string;
  /** Episode ID for analytics tracking */
  episodeId?: string;
  /** Source of the click for analytics (default: "transcript") */
  source?: TimestampClickSource;
}

/**
 * Clickable timestamp link that seeks the YouTube video to a specific time
 * Displays time in human-readable format (e.g., "12:34")
 * Optionally tracks clicks to Google Analytics when episodeId is provided
 */
export function TimestampLink({
  seconds,
  className,
  episodeId,
  source = "transcript",
}: TimestampLinkProps) {
  const youtube = useYouTubeOptional();
  const formattedTime = formatTimestamp(seconds);

  const handleClick = () => {
    // Track the click (non-blocking, fires before video seek)
    if (episodeId) {
      trackTimestampClick(episodeId, seconds, source);
    }

    // Seek video to timestamp
    if (youtube) {
      youtube.seekTo(seconds);

      // Scroll video into view smoothly
      const videoContainer = document.querySelector("[data-youtube-player]");
      if (videoContainer) {
        videoContainer.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "font-mono text-sm tabular-nums",
        "text-orange-500 hover:text-orange-600 hover:underline",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2",
        "transition-colors",
        className
      )}
      aria-label={`Ir para ${formattedTime} no vídeo`}
    >
      {formattedTime}
    </button>
  );
}
