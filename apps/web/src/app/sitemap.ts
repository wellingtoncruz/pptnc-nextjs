import type { MetadataRoute } from "next";

import { getEpisodes } from "@/lib/datastore/episodes";
import { logger } from "@/lib/logger";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnaocompila.com.br";

  // Fetch episodes (same as generateStaticParams - no timeout needed)
  let episodes: { slug: string; publishedAt: Date }[] = [];
  try {
    episodes = await getEpisodes();
  } catch (error) {
    logger.warn("Failed to fetch episodes for sitemap", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // For dynamic pages (home, episodes list), use the most recent episode date
  const latestEpisodeDate =
    episodes.length > 0 ? episodes[0].publishedAt : new Date("2026-01-01");

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: latestEpisodeDate,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/episodios`,
      lastModified: latestEpisodeDate,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/contato`,
      lastModified: new Date("2026-01-01"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/sugerir-pauta`,
      lastModified: new Date("2026-01-01"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/midiakit`,
      lastModified: latestEpisodeDate,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  // Episode pages (if available)
  const episodePages: MetadataRoute.Sitemap = episodes.map((episode) => ({
    url: `${baseUrl}/episodios/${episode.slug}`,
    lastModified: episode.publishedAt,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...episodePages];
}
