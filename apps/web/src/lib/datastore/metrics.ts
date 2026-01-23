import { unstable_cache } from "next/cache";
import { getFirestoreClient, COLLECTION_METRICS } from "./client";
import { logger } from "@/lib/logger";

/**
 * Podcast metrics for the Midiakit page
 * Stored in Firestore to allow updates without redeploying
 */
export interface PodcastMetrics {
  /** Total number of published episodes */
  episodes: number;
  /** Number of short clips/cuts */
  cortes: number;
  /** Number of reels */
  reels: number;
  /** YouTube subscribers count */
  youtubeSubscribers: number;
  /** Spotify followers count */
  spotifyFollowers: number;
  /** Monthly listeners across platforms */
  monthlyListeners: number;
  /** Total downloads/plays */
  totalPlays: number;
  /** Social media reach */
  socialReach: number;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Default metrics to show when Firestore is unavailable
 * These should be updated periodically with real values
 */
const DEFAULT_METRICS: PodcastMetrics = {
  episodes: 202,
  cortes: 0,
  reels: 0,
  youtubeSubscribers: 0,
  spotifyFollowers: 0,
  monthlyListeners: 0,
  totalPlays: 0,
  socialReach: 0,
  updatedAt: new Date(),
};

// Cache duration: 1 hour
const CACHE_REVALIDATE = 3600;

/**
 * Fetches podcast metrics from Firestore
 * Falls back to default metrics if Firestore is unavailable
 */
async function fetchMetricsFromFirestore(): Promise<PodcastMetrics> {
  try {
    const db = await getFirestoreClient();
    const docRef = db.collection(COLLECTION_METRICS).doc("podcast");
    const doc = await docRef.get();

    if (!doc.exists) {
      logger.warn("No metrics document found, using defaults", { service: "metrics" });
      return DEFAULT_METRICS;
    }

    const data = doc.data();
    if (!data) {
      return DEFAULT_METRICS;
    }

    return {
      episodes: data.episodes ?? DEFAULT_METRICS.episodes,
      cortes: data.cortes ?? DEFAULT_METRICS.cortes,
      reels: data.reels ?? DEFAULT_METRICS.reels,
      youtubeSubscribers: data.youtubeSubscribers ?? DEFAULT_METRICS.youtubeSubscribers,
      spotifyFollowers: data.spotifyFollowers ?? DEFAULT_METRICS.spotifyFollowers,
      monthlyListeners: data.monthlyListeners ?? DEFAULT_METRICS.monthlyListeners,
      totalPlays: data.totalPlays ?? DEFAULT_METRICS.totalPlays,
      socialReach: data.socialReach ?? DEFAULT_METRICS.socialReach,
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    };
  } catch (error) {
    logger.error("Failed to fetch metrics from Firestore", {
      service: "metrics",
      error: error instanceof Error ? error.message : String(error),
    });
    return DEFAULT_METRICS;
  }
}

/**
 * Gets podcast metrics with caching
 * Cached for 1 hour to match ISR revalidation
 */
export const getMetrics = unstable_cache(
  fetchMetricsFromFirestore,
  ["podcast-metrics"],
  { revalidate: CACHE_REVALIDATE }
);

/**
 * Formats a number for display (e.g., 1500 -> "1.5K")
 */
export function formatMetricNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return num.toString();
}
