"use client";

import { useState } from "react";

import { Music, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface SpotifyEmbedProps {
  /** Spotify URL (episode or show) */
  spotifyUrl: string;
  /** Episode title for accessibility */
  title: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Extracts the Spotify embed URL from a regular Spotify URL
 * Supports both episode and show URLs
 */
function getSpotifyEmbedUrl(spotifyUrl: string): string | null {
  try {
    const url = new URL(spotifyUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);

    // Expected format: /episode/ID or /show/ID
    if (pathParts.length >= 2) {
      const type = pathParts[0]; // "episode" or "show"
      const id = pathParts[1];

      if ((type === "episode" || type === "show") && id) {
        return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function SpotifyEmbed({
  spotifyUrl,
  title,
  className,
}: SpotifyEmbedProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const embedUrl = getSpotifyEmbedUrl(spotifyUrl);

  if (!embedUrl || hasError) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-lg bg-muted p-8",
          className
        )}
      >
        <Music className="h-12 w-12 text-muted-foreground" />
        <p className="text-center text-sm text-muted-foreground">
          {hasError ? "Erro ao carregar player do Spotify" : "Link do Spotify indisponivel"}
        </p>
        <a
          href={spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1ed760]"
          aria-label={`Abrir ${title} no Spotify`}
        >
          Abrir no Spotify
        </a>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Spotify iframe embed */}
      <iframe
        src={embedUrl}
        width="100%"
        height="352"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        className="rounded-xl"
        title={`Spotify: ${title}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
    </div>
  );
}
