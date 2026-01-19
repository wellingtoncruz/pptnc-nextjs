"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";

import { Play, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * YouTube IFrame API types
 * @see https://developers.google.com/youtube/iframe_api_reference
 */
declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
    __ytCallbackQueue?: Array<() => void>;
  }
}

interface YouTubeEmbedProps {
  /** YouTube video ID */
  youtubeId: string;
  /** Custom thumbnail URL (falls back to YouTube default) */
  thumbnailUrl?: string;
  /** Video title for accessibility */
  title: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when player is ready (for Epic 3 timestamp sync) */
  onPlayerReady?: (player: YT.Player) => void;
  /** Callback when player state changes (for Epic 3 timestamp sync) */
  onStateChange?: (state: number) => void;
}

export function YouTubeEmbed({
  youtubeId,
  thumbnailUrl,
  title,
  className,
  onPlayerReady,
  onStateChange,
}: YouTubeEmbedProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);

  // Thumbnail fallback to YouTube default if not provided
  const thumbnail =
    thumbnailUrl || `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;

  // Load YouTube IFrame API and initialize player
  useEffect(() => {
    if (!isPlaying || !youtubeId) return;

    let isMounted = true;

    const initPlayer = () => {
      if (!containerRef.current || !isMounted) return;

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: youtubeId,
        playerVars: {
          autoplay: 1,
          rel: 0,
          enablejsapi: 1,
          origin: typeof window !== "undefined" ? window.location.origin : "",
          modestbranding: 1,
        },
        events: {
          onReady: (event: YT.PlayerEvent) => {
            if (isMounted) {
              setIsLoading(false);
              onPlayerReady?.(event.target);
            }
          },
          onStateChange: (event: YT.OnStateChangeEvent) => {
            if (isMounted) {
              onStateChange?.(event.data);
            }
          },
        },
      });
    };

    const loadYouTubeAPI = () => {
      // If YT API is already loaded, initialize player directly
      if (window.YT && window.YT.Player) {
        initPlayer();
        return;
      }

      // Initialize callback queue if not exists
      if (!window.__ytCallbackQueue) {
        window.__ytCallbackQueue = [];
      }

      // Add our callback to the queue
      window.__ytCallbackQueue.push(initPlayer);

      // Check if script is already being loaded
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );

      if (existingScript) {
        // Script already loading, our callback is in the queue
        return;
      }

      // Load the YouTube IFrame API script
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];

      if (firstScriptTag?.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        // Fallback: append to head (handles test environment)
        document.head.appendChild(tag);
      }

      // Set up the global callback to process the queue
      window.onYouTubeIframeAPIReady = () => {
        const queue = window.__ytCallbackQueue || [];
        window.__ytCallbackQueue = [];
        queue.forEach((callback) => callback());
      };
    };

    loadYouTubeAPI();

    return () => {
      isMounted = false;
      // Remove our callback from the queue if still pending
      if (window.__ytCallbackQueue) {
        const index = window.__ytCallbackQueue.indexOf(initPlayer);
        if (index > -1) {
          window.__ytCallbackQueue.splice(index, 1);
        }
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [isPlaying, youtubeId, onPlayerReady, onStateChange]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setIsLoading(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handlePlay();
      }
    },
    [handlePlay]
  );

  // Handle missing youtubeId
  if (!youtubeId) {
    return (
      <div
        className={cn(
          "relative aspect-video overflow-hidden rounded-lg bg-muted",
          className
        )}
      >
        <div className="flex h-full items-center justify-center">
          <span className="text-muted-foreground">Video nao disponivel</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden rounded-lg",
        className
      )}
    >
      {isPlaying ? (
        <>
          {/* Loading state while iframe loads */}
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
              <Loader2 className="h-12 w-12 animate-spin text-white" />
            </div>
          )}
          {/* Player container - YouTube API will inject iframe here */}
          <div ref={containerRef} className="absolute inset-0 h-full w-full" />
        </>
      ) : (
        <button
          type="button"
          onClick={handlePlay}
          onKeyDown={handleKeyDown}
          className="group relative h-full w-full cursor-pointer"
          aria-label={`Reproduzir ${title}`}
        >
          <Image
            src={thumbnail}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 896px"
            priority
          />
          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/40">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-transform group-hover:scale-110">
              <Play className="h-8 w-8 fill-current pl-1" />
            </div>
          </div>
        </button>
      )}
    </div>
  );
}
