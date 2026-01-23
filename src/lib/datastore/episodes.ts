import { unstable_cache } from "next/cache";
import { getFirestoreClient, COLLECTION_EPISODES, COLLECTION_TOPICS } from "./client";
import { logger } from "@/lib/logger";

import type {
  Episode,
  EpisodeEntity,
  EpisodeContentDetails,
  EpisodeStatistics,
  EpisodeThumbnails,
} from "@/types/episode";
import type { Guest } from "@/types/guest";
import type { Firestore, DocumentData } from "@google-cloud/firestore";

/**
 * Options for fetching episodes
 */
interface GetEpisodesOptions {
  /** Maximum number of episodes to return */
  limit?: number;
  /** Number of episodes to skip (for pagination) */
  offset?: number;
}

// Cache duration: 1 hour (matches ISR revalidation)
const CACHE_REVALIDATE = 3600;

/**
 * Internal function to fetch all episodes from Firestore (without transcripts)
 * Transcripts are excluded to keep cache size manageable (~50MB -> ~2MB)
 * This is wrapped by unstable_cache for cross-request caching
 */
// Fields needed for episode listing (excludes large transcript fields)
const EPISODE_LIST_FIELDS = [
  "resourceId",
  "publishedAt",
  "slug",
  "title",
  "description",
  "duration",
  "thumbnails",
  "channelId",
  "channelTitle",
  "playlistId",
  "position",
  "statistics",
  "contentDetails",
  "spotifyUrl",
  "audioUrl",
  "guests",
  "topics",
  "isFullEpisode",
];

async function fetchAllEpisodesFromFirestore(): Promise<Episode[]> {
  try {
    const db = await getFirestoreClient();

    // Use select() to fetch only needed fields, excluding transcripts (~46MB -> ~2MB)
    const snapshot = await db
      .collection(COLLECTION_EPISODES)
      .where("isFullEpisode", "==", true)
      .orderBy("publishedAt", "desc")
      .select(...EPISODE_LIST_FIELDS)
      .get();

    // Map WITHOUT transcripts - they're excluded at query level now
    return snapshot.docs.map((doc) => mapDocumentToEpisode(doc.id, doc.data(), db, false));
  } catch (error) {
    logger.warn("Firestore not available, returning empty episodes", {
      service: "episodes",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Cached version of fetchAllEpisodesFromFirestore
 * Uses Next.js Data Cache - persists across requests for 1 hour
 */
const getCachedAllEpisodes = unstable_cache(
  fetchAllEpisodesFromFirestore,
  ["all-episodes"],
  { revalidate: CACHE_REVALIDATE, tags: ["episodes"] }
);

/**
 * Fetches episodes sorted by publication date (newest first) with database-level pagination
 * Returns empty array if Firestore is not available (e.g., during build)
 *
 * @param options - Optional parameters for the query
 * @returns Array of episodes sorted by publishedAt descending
 */
export async function getEpisodes(
  options?: GetEpisodesOptions
): Promise<Episode[]> {
  // For paginated requests, fetch from cache and slice
  const allEpisodes = await getCachedAllEpisodes();

  const offset = options?.offset || 0;
  const limit = options?.limit;

  if (limit) {
    return allEpisodes.slice(offset, offset + limit);
  }

  return offset > 0 ? allEpisodes.slice(offset) : allEpisodes;
}

/**
 * Gets the total count of full episodes using Firestore COUNT aggregation
 * This is O(1) - does not transfer document data, only the count
 * Returns 0 if Firestore is not available (e.g., during build)
 *
 * @returns Total number of full episodes
 */
export async function getEpisodesCount(): Promise<number> {
  // Use cached episodes length - already fetched, no extra query needed
  const episodes = await getCachedAllEpisodes();
  return episodes.length;
}

/**
 * Fetches a single episode by its YouTube video ID
 *
 * @param videoId - The YouTube video ID
 * @returns The episode if found, null otherwise
 */
export async function getEpisodeByVideoId(
  videoId: string
): Promise<Episode | null> {
  const episodes = await getCachedAllEpisodes();
  return episodes.find((ep) => ep.youtubeId === videoId) || null;
}

/**
 * Fetches a single episode by its URL slug (without transcript)
 * Uses cached episode list for O(1) lookup after initial fetch
 *
 * @param slug - The URL-friendly slug of the episode
 * @returns The episode if found, null otherwise
 */
export async function getEpisodeBySlug(slug: string): Promise<Episode | null> {
  const episodes = await getCachedAllEpisodes();
  return episodes.find((episode) => episode.slug === slug) || null;
}

/**
 * Fetches a single episode by slug WITH full transcript data
 * This bypasses the cache and fetches directly from Firestore
 * Use this only on episode detail pages where transcript is needed
 *
 * @param slug - The URL-friendly slug of the episode
 * @returns The episode with transcript if found, null otherwise
 */
export async function getEpisodeBySlugWithTranscript(slug: string): Promise<Episode | null> {
  // First find the episode ID from cache (fast)
  const cachedEpisode = await getEpisodeBySlug(slug);
  if (!cachedEpisode) {
    return null;
  }

  // Then fetch full data with transcript directly from Firestore
  try {
    const db = await getFirestoreClient();
    const snapshot = await db
      .collection(COLLECTION_EPISODES)
      .where("resourceId.videoId", "==", cachedEpisode.youtubeId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return cachedEpisode; // Fallback to cached version
    }

    const doc = snapshot.docs[0];
    return mapDocumentToEpisode(doc.id, doc.data(), db, true);
  } catch (error) {
    logger.warn("Failed to fetch episode with transcript, using cached", {
      service: "episodes",
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return cachedEpisode; // Fallback to cached version
  }
}

/**
 * Fetches episodes filtered by a specific topic with database-level pagination
 *
 * @param topic - The topic slug to filter by
 * @param options - Optional pagination parameters
 * @returns Array of episodes that have the specified topic, sorted by publishedAt desc
 */
export async function getEpisodesByTopic(
  topic: string,
  options?: GetEpisodesOptions
): Promise<Episode[]> {
  const allEpisodes = await getCachedAllEpisodes();
  const filtered = allEpisodes.filter((ep) => ep.topics.includes(topic));

  const offset = options?.offset || 0;
  const limit = options?.limit;

  if (limit) {
    return filtered.slice(offset, offset + limit);
  }

  return offset > 0 ? filtered.slice(offset) : filtered;
}

/**
 * Gets count of full episodes with a specific topic
 * Uses cached data - no additional Firestore query
 *
 * @param topic - The topic slug to count
 * @returns Number of full episodes with the topic
 */
export async function getEpisodesCountByTopic(topic: string): Promise<number> {
  const allEpisodes = await getCachedAllEpisodes();
  return allEpisodes.filter((ep) => ep.topics.includes(topic)).length;
}

/**
 * Internal function to fetch all topics from Firestore
 */
async function fetchAllTopicsFromFirestore(): Promise<string[]> {
  try {
    const db = await getFirestoreClient();

    const snapshot = await db.collection(COLLECTION_TOPICS).get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (data.name) return data.name as string;
        return doc.id || null;
      })
      .filter((name): name is string => name !== null)
      .sort();
  } catch (error) {
    logger.warn("Firestore not available for topics", {
      service: "episodes",
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Cached version of fetchAllTopicsFromFirestore
 */
const getCachedAllTopics = unstable_cache(
  fetchAllTopicsFromFirestore,
  ["all-topics"],
  { revalidate: CACHE_REVALIDATE, tags: ["topics"] }
);

/**
 * Gets all topics from the dedicated topics collection (fast query)
 * Uses Next.js Data Cache for cross-request caching
 *
 * @returns Sorted array of unique topic strings
 */
export async function getAllTopics(): Promise<string[]> {
  return getCachedAllTopics();
}

/**
 * Fetches the most recent full episode (single record from cache)
 * Returns null if Firestore is not available (e.g., during build)
 *
 * @returns The latest episode or null if no episodes exist
 */
export async function getLatestEpisode(): Promise<Episode | null> {
  const episodes = await getCachedAllEpisodes();
  return episodes[0] || null;
}

/**
 * Clears the cache (useful for testing)
 * Note: In production, use revalidateTag('episodes') or revalidateTag('topics')
 */
export function clearTopicsCache(): void {
  // No-op for unstable_cache - use revalidateTag in production
  // This function is kept for test compatibility
}

/**
 * Finds episodes related to the current one based on shared topics.
 * Falls back to recent episodes if not enough related found.
 *
 * Algorithm:
 * 1. Exclude current episode from candidates
 * 2. Score candidates by number of shared topics (case-insensitive matching)
 * 3. Sort by shared topics (desc), then by date (desc)
 * 4. Return top matches, filling with recent episodes if needed
 *
 * Note: publishedAt may be Date object or ISO string (after JSON cache serialization)
 *
 * @param currentEpisode - The episode to find related content for
 * @param limit - Maximum number of related episodes to return (default: 4)
 * @returns Array of related episodes
 */
export async function getRelatedEpisodes(
  currentEpisode: Episode,
  limit: number = 4
): Promise<Episode[]> {
  const allEpisodes = await getCachedAllEpisodes();

  // Exclude current episode from candidates
  const candidates = allEpisodes.filter((ep) => ep.id !== currentEpisode.id);

  // If current episode has no topics, return most recent
  if (currentEpisode.topics.length === 0) {
    return candidates.slice(0, limit);
  }

  // Score each candidate by number of shared topics (case-insensitive)
  const currentTopicsLower = currentEpisode.topics.map((t) => t.toLowerCase());
  const scored = candidates.map((ep) => ({
    episode: ep,
    sharedTopics: ep.topics.filter((t) =>
      currentTopicsLower.includes(t.toLowerCase())
    ).length,
  }));

  // Sort by shared topics (desc), then by date (desc)
  scored.sort((a, b) => {
    if (b.sharedTopics !== a.sharedTopics) {
      return b.sharedTopics - a.sharedTopics;
    }
    // Handle both Date objects and ISO strings (after JSON serialization)
    const dateA =
      a.episode.publishedAt instanceof Date
        ? a.episode.publishedAt.getTime()
        : new Date(a.episode.publishedAt).getTime();
    const dateB =
      b.episode.publishedAt instanceof Date
        ? b.episode.publishedAt.getTime()
        : new Date(b.episode.publishedAt).getTime();
    return dateB - dateA;
  });

  // Get episodes with at least one shared topic
  const related = scored
    .filter((s) => s.sharedTopics > 0)
    .slice(0, limit)
    .map((s) => s.episode);

  // Fallback: fill with recent episodes if not enough related
  if (related.length < limit) {
    const remaining = limit - related.length;
    const relatedIds = new Set(related.map((e) => e.id));
    const recent = candidates
      .filter((e) => !relatedIds.has(e.id))
      .slice(0, remaining);
    return [...related, ...recent];
  }

  return related;
}

/**
 * Generates a URL-friendly slug from a title
 *
 * @param title - The episode title
 * @returns A URL-friendly slug
 */
function generateSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Remove consecutive hyphens
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Maps a Firestore document to a typed Episode object
 * Handles field name mapping between Firestore schema and application types
 *
 * @param docId - The Firestore document ID
 * @param data - The raw Firestore document data
 * @param _db - The Firestore client (kept for API compatibility)
 * @param includeTranscript - Whether to include transcript fields (default: true)
 * @returns A typed Episode object
 */
function mapDocumentToEpisode(
  docId: string,
  data: DocumentData,
  _db: Firestore,
  includeTranscript: boolean = true
): Episode {
  const entity = data as EpisodeEntity;

  // Use resourceId.videoId as primary ID, fallback to document ID
  const id = entity.resourceId?.videoId || docId;

  // Handle date conversion - Firestore may return Timestamp, Date, string, or number
  let publishedAt: Date;
  const pubDate = entity.publishedAt;
  if (pubDate && typeof pubDate === "object" && "toDate" in pubDate) {
    // Firestore Timestamp
    publishedAt = (pubDate as { toDate: () => Date }).toDate();
  } else if (pubDate instanceof Date) {
    publishedAt = pubDate;
  } else if (typeof pubDate === "string") {
    publishedAt = new Date(pubDate);
  } else if (typeof pubDate === "number") {
    publishedAt = new Date(pubDate);
  } else {
    publishedAt = new Date();
  }

  // Get YouTube video ID from resourceId
  const youtubeId = entity.resourceId?.videoId || "";

  // Generate slug from title if not present (future field)
  const slug = entity.slug || generateSlugFromTitle(entity.title || "");

  // Get thumbnail URL from thumbnails object (prefer high quality)
  const thumbnailUrl =
    entity.thumbnails?.high?.url ||
    entity.thumbnails?.medium?.url ||
    entity.thumbnails?.default?.url ||
    "";

  // Ensure thumbnails object exists with defaults
  const defaultThumbnail = { url: "", width: 0, height: 0 };
  const thumbnails: EpisodeThumbnails = {
    default: entity.thumbnails?.default || defaultThumbnail,
    medium: entity.thumbnails?.medium || defaultThumbnail,
    high: entity.thumbnails?.high || defaultThumbnail,
  };

  // Ensure statistics object exists with defaults
  const statistics: EpisodeStatistics = {
    commentCount: entity.statistics?.commentCount || "0",
    favoriteCount: entity.statistics?.favoriteCount || "0",
    viewCount: entity.statistics?.viewCount || "0",
    likeCount: entity.statistics?.likeCount || "0",
  };

  // Ensure contentDetails object exists with defaults
  const contentDetails: EpisodeContentDetails = {
    caption: entity.contentDetails?.caption || "false",
    dimension: entity.contentDetails?.dimension || "2d",
    duration: entity.contentDetails?.duration || "",
    definition: entity.contentDetails?.definition || "hd",
    contentRating: entity.contentDetails?.contentRating || {},
    projection: entity.contentDetails?.projection || "rectangular",
    licensedContent: entity.contentDetails?.licensedContent || false,
  };

  // Map guest entities to Guest objects
  const guests: Guest[] = Array.isArray(entity.guests)
    ? entity.guests.map((g) => ({
        name: g.name || "",
        role: g.role,
        company: g.company,
        photo: g.photo,
        linkedin: g.linkedin,
      }))
    : [];

  // Ensure topics is always an array of strings
  const topics: string[] = Array.isArray(entity.topics) ? entity.topics : [];

  return {
    id,
    slug,
    title: entity.title || "",
    description: entity.description || "",
    publishedAt,
    duration: entity.duration || 0,
    youtubeId,
    thumbnails,
    thumbnailUrl,
    // Only include transcripts when explicitly requested (to keep cache small)
    transcript: includeTranscript ? entity.transcriptionTXT : undefined,
    transcriptSrt: includeTranscript ? entity.transcriptionSRT : undefined,
    channelId: entity.channelId || "",
    channelTitle: entity.channelTitle || "",
    playlistId: entity.playlistId || "",
    position: entity.position || 0,
    statistics,
    contentDetails,
    spotifyUrl: entity.spotifyUrl,
    audioUrl: entity.audioUrl,
    guests,
    topics,
  };
}
