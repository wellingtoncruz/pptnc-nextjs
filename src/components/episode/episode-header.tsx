import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { MediaTabs } from "@/components/episode/media-tabs";
import { formatDate, formatDuration } from "@/lib/formatters";

import type { Episode } from "@/types";

interface EpisodeHeaderProps {
  episode: Episode;
}

export function EpisodeHeader({ episode }: EpisodeHeaderProps) {
  return (
    <header className="space-y-6">
      {/* Media Player - YouTube with optional Spotify tab */}
      <MediaTabs
        youtubeId={episode.youtubeId}
        thumbnailUrl={episode.thumbnailUrl}
        spotifyUrl={episode.spotifyUrl}
        title={episode.title}
      />

      {/* Title */}
      <h1 className="text-3xl font-bold md:text-4xl">{episode.title}</h1>

      {/* Metadata - date and duration */}
      <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
        <span>{formatDate(episode.publishedAt)}</span>
        {episode.duration > 0 && (
          <>
            <span>•</span>
            <span>{formatDuration(episode.duration)}</span>
          </>
        )}
      </div>

      {/* Topics - clickable links to filtered episode list */}
      {episode.topics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {episode.topics.map((topic) => (
            <Link key={topic} href={`/episodios?topic=${encodeURIComponent(topic)}`}>
              <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                {topic}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
