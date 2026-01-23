import Image from "next/image";
import Link from "next/link";
import { Play, Headphones } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { YouTubeEmbed } from "@/components/episode/youtube-embed";
import { formatDate, formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";

import type { Episode } from "@/types";

export interface FeaturedEpisodeHeroProps {
  /** The featured episode to display */
  episode: Episode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Hero component for displaying the featured episode on the home page.
 * Shows video player with lazy load, episode info, guests, and CTAs.
 */
export function FeaturedEpisodeHero({
  episode,
  className,
}: FeaturedEpisodeHeroProps) {
  const episodeUrl = `/episodios/${episode.slug}`;

  return (
    <Card className={cn("overflow-hidden shadow-lg !py-0 max-w-full", className)}>
      <div className="grid gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-2 lg:gap-8 lg:p-8 max-w-full overflow-hidden">
        {/* Video Player Section + CTAs */}
        <div className="flex flex-col gap-4 min-w-0">
          <div className="relative aspect-video overflow-hidden rounded-lg">
            <YouTubeEmbed
              youtubeId={episode.youtubeId}
              title={episode.title}
              thumbnailUrl={episode.thumbnailUrl}
            />
          </div>

          {/* CTAs - Below player */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center min-w-0">
            <Button asChild className="w-full sm:w-auto">
              <Link href={episodeUrl}>
                <Play className="mr-2 h-4 w-4" />
                Ver episódio completo
              </Link>
            </Button>
            {episode.spotifyUrl && (
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <a
                  href={episode.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ouvir no Spotify (abre em nova aba)"
                >
                  <Headphones className="mr-2 h-4 w-4" />
                  Ouvir no Spotify
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="flex flex-col justify-center min-w-0 overflow-hidden">
          {/* Title */}
          <Link href={episodeUrl} className="group">
            <h2 className="text-2xl font-bold leading-tight tracking-tight transition-colors group-hover:text-primary sm:text-3xl">
              {episode.title}
            </h2>
          </Link>

          {/* Metadata */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>{formatDate(episode.publishedAt)}</span>
            {episode.duration > 0 && (
              <>
                <span>•</span>
                <span>{formatDuration(episode.duration)}</span>
              </>
            )}
          </div>

          {/* Description */}
          {episode.description && (
            <p className="mt-4 line-clamp-4 text-muted-foreground">
              {episode.description}
            </p>
          )}

          {/* Topics */}
          {episode.topics.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {episode.topics.slice(0, 4).map((topic) => (
                <Badge key={topic} variant="secondary">
                  {topic}
                </Badge>
              ))}
            </div>
          )}

          {/* Guests - Compact display */}
          {episode.guests.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-3 sm:justify-center">
                {episode.guests.map((guest, index) => {
                  const guestPhotoUrl = guest.photo ? `/guests/${guest.photo}` : guest.photoUrl;
                  const hasLinkedIn = Boolean(guest.linkedin);

                  const avatarContent = (
                    <Avatar className="h-8 w-8">
                      {guestPhotoUrl ? (
                        <Image
                          src={guestPhotoUrl}
                          alt={guest.name}
                          width={32}
                          height={32}
                          className="h-full w-full object-cover rounded-full"
                        />
                      ) : (
                        <AvatarFallback className="text-xs">
                          {guest.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      )}
                    </Avatar>
                  );

                  const nameContent = (
                    <div className="text-sm">
                      <p className="font-medium leading-none">{guest.name}</p>
                      {(guest.role || guest.company) && (
                        <p className="text-xs text-muted-foreground">
                          {guest.role}
                          {guest.role && guest.company && " @ "}
                          {guest.company}
                        </p>
                      )}
                    </div>
                  );

                  if (hasLinkedIn) {
                    return (
                      <a
                        key={`${guest.name}-${index}`}
                        href={guest.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 transition-opacity hover:opacity-80"
                        aria-label={`Ver perfil de ${guest.name} no LinkedIn`}
                      >
                        {avatarContent}
                        {nameContent}
                      </a>
                    );
                  }

                  return (
                    <div
                      key={`${guest.name}-${index}`}
                      className="flex items-center gap-2"
                    >
                      {avatarContent}
                      {nameContent}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
