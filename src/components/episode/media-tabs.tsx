"use client";

import { Youtube } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { YouTubeEmbed } from "@/components/episode/youtube-embed";
import { SpotifyEmbed } from "@/components/episode/spotify-embed";
import { cn } from "@/lib/utils";

/** Spotify icon - lucide-react doesn't have Spotify, using custom SVG */
function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

interface MediaTabsProps {
  /** YouTube video ID */
  youtubeId: string;
  /** Spotify URL (episode or show) */
  spotifyUrl?: string;
  /** Custom thumbnail URL for YouTube */
  thumbnailUrl?: string;
  /** Episode title for accessibility */
  title: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when YouTube player is ready */
  onYouTubePlayerReady?: (player: YT.Player) => void;
  /** Callback when YouTube player state changes */
  onYouTubeStateChange?: (state: number) => void;
  /** Register a callback to start video playback */
  registerStartPlayback?: (callback: () => void) => void;
}

export function MediaTabs({
  youtubeId,
  spotifyUrl,
  thumbnailUrl,
  title,
  className,
  onYouTubePlayerReady,
  onYouTubeStateChange,
  registerStartPlayback,
}: MediaTabsProps) {
  // If no Spotify URL, just render YouTube without tabs
  if (!spotifyUrl) {
    return (
      <YouTubeEmbed
        youtubeId={youtubeId}
        thumbnailUrl={thumbnailUrl}
        title={title}
        className={className}
        onPlayerReady={onYouTubePlayerReady}
        onStateChange={onYouTubeStateChange}
        registerStartPlayback={registerStartPlayback}
      />
    );
  }

  return (
    <Tabs defaultValue="video" className={cn("w-full", className)}>
      <TabsList className="mb-4">
        <TabsTrigger value="video" className="gap-2">
          <Youtube className="h-4 w-4" />
          Vídeo
        </TabsTrigger>
        <TabsTrigger value="audio" className="gap-2">
          <SpotifyIcon className="h-4 w-4" />
          Áudio
        </TabsTrigger>
      </TabsList>

      <TabsContent value="video">
        <YouTubeEmbed
          youtubeId={youtubeId}
          thumbnailUrl={thumbnailUrl}
          title={title}
          onPlayerReady={onYouTubePlayerReady}
          onStateChange={onYouTubeStateChange}
          registerStartPlayback={registerStartPlayback}
        />
      </TabsContent>

      <TabsContent value="audio">
        <SpotifyEmbed spotifyUrl={spotifyUrl} title={title} />
      </TabsContent>
    </Tabs>
  );
}
