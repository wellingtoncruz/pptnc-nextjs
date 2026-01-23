import type { MetadataRoute } from "next";

import { getEpisodes } from "@/lib/datastore/episodes";
import { logger } from "@/lib/logger";

// Helper to add timeout to promises
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnc.com.br";

  // Fetch episodes with 10s timeout to prevent build hang
  let episodes: { slug: string; publishedAt: Date }[] = [];
  try {
    episodes = await withTimeout(getEpisodes(), 10000, []);
  } catch (error) {
    logger.warn("Failed to fetch episodes for sitemap", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/episodios`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
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
