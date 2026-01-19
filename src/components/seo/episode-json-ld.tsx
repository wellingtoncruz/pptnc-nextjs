import type { Episode } from "@/types";
import { SITE_CONFIG } from "@/lib/constants";

export interface EpisodeJsonLdProps {
  episode: Episode;
  baseUrl: string;
}

/**
 * Generates Schema.org JSON-LD structured data for a podcast episode.
 * Includes PodcastEpisode with nested VideoObject for SEO.
 *
 * @see https://schema.org/PodcastEpisode
 * @see https://schema.org/VideoObject
 */
export function EpisodeJsonLd({ episode, baseUrl }: EpisodeJsonLdProps) {
  const episodeUrl = `${baseUrl}/episodios/${episode.slug}`;
  const thumbnailUrl = episode.thumbnailUrl || `https://img.youtube.com/vi/${episode.youtubeId}/hqdefault.jpg`;
  const youtubeEmbedUrl = `https://www.youtube.com/embed/${episode.youtubeId}`;
  const youtubeWatchUrl = `https://www.youtube.com/watch?v=${episode.youtubeId}`;

  // Use ISO 8601 duration from contentDetails if available, otherwise convert seconds
  const duration = episode.contentDetails?.duration || formatDurationISO8601(episode.duration);

  // Ensure publishedAt is converted to ISO string (handles Date, string, or timestamp)
  const publishedAt = formatDateISO8601(episode.publishedAt);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    name: episode.title,
    description: episode.description || undefined,
    datePublished: publishedAt,
    duration,
    episodeNumber: episode.position,
    url: episodeUrl,
    image: thumbnailUrl,
    partOfSeries: {
      "@type": "PodcastSeries",
      name: SITE_CONFIG.name,
      url: baseUrl,
    },
    associatedMedia: {
      "@type": "VideoObject",
      name: episode.title,
      description: episode.description || undefined,
      thumbnailUrl,
      uploadDate: publishedAt,
      duration,
      embedUrl: youtubeEmbedUrl,
      contentUrl: youtubeWatchUrl,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/**
 * Converts a date value to ISO 8601 string format
 * Handles Date objects, ISO strings, and timestamps
 * @param date - Date value (Date, string, or number)
 * @returns ISO 8601 date string
 */
function formatDateISO8601(date: Date | string | number): string {
  if (date instanceof Date) {
    return date.toISOString();
  }
  if (typeof date === "string") {
    // Already an ISO string or parseable date string
    return new Date(date).toISOString();
  }
  if (typeof date === "number") {
    // Timestamp in milliseconds
    return new Date(date).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Converts seconds to ISO 8601 duration format (PTxHxMxS)
 * @param seconds - Duration in seconds
 * @returns ISO 8601 duration string (e.g., "PT1H30M45S")
 */
function formatDurationISO8601(seconds: number): string {
  if (seconds <= 0) return "PT0S";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  let duration = "PT";
  if (hours > 0) duration += `${hours}H`;
  if (minutes > 0) duration += `${minutes}M`;
  if (secs > 0 || duration === "PT") duration += `${secs}S`;

  return duration;
}
