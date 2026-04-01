import { getEpisodes } from "@/lib/datastore/episodes";
import { escapeHtml } from "@/lib/utils";
import { SITE_CONFIG, EXTERNAL_LINKS } from "@/lib/constants";
import { logger } from "@/lib/logger";

import type { Episode } from "@/types/episode";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://pptnaocompila.com.br";

/**
 * Formats duration in seconds to HH:MM:SS for itunes:duration
 */
function formatItunesDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function buildEpisodeItem(episode: Episode): string {
  const episodeUrl = `${BASE_URL}/episodios/${episode.slug}`;
  const pubDate = new Date(episode.publishedAt).toUTCString();
  const thumbnail = episode.thumbnails?.high?.url || episode.thumbnailUrl;

  return `    <item>
      <title>${escapeHtml(episode.title)}</title>
      <link>${episodeUrl}</link>
      <guid isPermaLink="true">${episodeUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeHtml(episode.description)}</description>
      <itunes:duration>${formatItunesDuration(episode.duration)}</itunes:duration>
      <itunes:image href="${escapeHtml(thumbnail)}" />
      <itunes:explicit>false</itunes:explicit>
    </item>`;
}

export async function GET(): Promise<Response> {
  let episodes: Episode[] = [];
  try {
    episodes = await getEpisodes();
  } catch (error) {
    logger.warn("Failed to fetch episodes for RSS feed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const lastBuildDate =
    episodes.length > 0
      ? new Date(episodes[0].publishedAt).toUTCString()
      : new Date().toUTCString();

  const items = episodes.map(buildEpisodeItem).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(SITE_CONFIG.name)}</title>
    <link>${BASE_URL}</link>
    <description>${escapeHtml(SITE_CONFIG.description)}</description>
    <language>pt-br</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <itunes:author>${escapeHtml(SITE_CONFIG.name)}</itunes:author>
    <itunes:image href="${BASE_URL}/logo.png" />
    <itunes:category text="Technology" />
    <itunes:explicit>false</itunes:explicit>
    <itunes:owner>
      <itunes:name>${escapeHtml(SITE_CONFIG.name)}</itunes:name>
    </itunes:owner>
    <image>
      <url>${BASE_URL}/logo.png</url>
      <title>${escapeHtml(SITE_CONFIG.name)}</title>
      <link>${BASE_URL}</link>
    </image>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
