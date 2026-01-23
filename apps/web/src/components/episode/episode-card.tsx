import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatDuration } from "@/lib/formatters";

import type { Episode } from "@/types";

/**
 * Props for the EpisodeCard component
 */
interface EpisodeCardProps {
  /** The episode data to display */
  episode: Episode;
  /** Display variant - "featured" for hero section, "compact" for listings */
  variant?: "featured" | "compact";
}

/**
 * Displays an episode card with thumbnail, title, and metadata.
 * Featured variant shows large image with full description.
 * Compact variant shows smaller thumbnail in a horizontal layout.
 *
 * @param props - Component props
 * @param props.episode - The episode data to display
 * @param props.variant - Display variant, defaults to "compact"
 * @returns A linked card component that navigates to the episode page
 */
export function EpisodeCard({ episode, variant = "compact" }: EpisodeCardProps) {
  const href = `/episodios/${episode.slug}`;

  if (variant === "featured") {
    return (
      <Link href={href} className="block">
        <Card className="group overflow-hidden transition-shadow hover:shadow-lg">
          <div className="relative aspect-video">
            {episode.thumbnailUrl ? (
              <Image
                src={episode.thumbnailUrl}
                alt={episode.title}
                fill
                className="object-cover transition-transform group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 896px"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-muted">
                <span className="text-4xl">🎙️</span>
              </div>
            )}
          </div>
          <CardContent className="p-6">
            <h2 className="line-clamp-2 text-2xl font-semibold group-hover:text-primary">
              {episode.title}
            </h2>
            {episode.description && (
              <p className="mt-2 line-clamp-3 text-muted-foreground">
                {episode.description}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{formatDate(episode.publishedAt)}</span>
              {episode.duration > 0 && (
                <>
                  <span>•</span>
                  <span>{formatDuration(episode.duration)}</span>
                </>
              )}
            </div>
            {episode.topics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {episode.topics.slice(0, 3).map((topic) => (
                  <Badge key={topic} variant="secondary">
                    {topic}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
    );
  }

  // Compact variant - vertical card layout
  return (
    <Link href={href} className="block h-full">
      <Card className="group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
        {/* Thumbnail - 16:9 aspect ratio to match YouTube */}
        <div className="relative aspect-video w-full shrink-0">
          {episode.thumbnailUrl ? (
            <Image
              src={episode.thumbnailUrl}
              alt={episode.title}
              fill
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-muted">
              <span className="text-2xl">🎙️</span>
            </div>
          )}
          {/* Duration badge overlay */}
          {episode.duration > 0 && (
            <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
              {formatDuration(episode.duration)}
            </span>
          )}
        </div>

        <CardContent className="flex flex-1 flex-col p-4">
          {/* Title - 3 lines max */}
          <h3 className="line-clamp-3 font-semibold leading-snug group-hover:text-primary">
            {episode.title}
          </h3>

          {/* Guests */}
          {episode.guests.length > 0 && (
            <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">
              {episode.guests.map((guest) => guest.name).join(", ")}
            </p>
          )}

          {/* Date */}
          <p className="mt-auto pt-2 text-sm text-muted-foreground">
            {formatDate(episode.publishedAt)}
          </p>

          {/* Topics */}
          {episode.topics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {episode.topics.slice(0, 2).map((topic) => (
                <Badge key={topic} variant="secondary" className="text-xs">
                  {topic}
                </Badge>
              ))}
              {episode.topics.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{episode.topics.length - 2}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
