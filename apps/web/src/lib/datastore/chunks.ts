/**
 * Firestore functions for fetching video chapters
 *
 * Supports two data sources:
 * 1. Legacy: sub-collection videos/{videoId}/chunks (older episodes)
 * 2. Current: flat "chapters" array on video document (IAra-processed episodes)
 */

import { getFirestoreClient, COLLECTION_EPISODES } from "./client";
import { parseSrtTimestamp } from "@/lib/transcript";
import { logger } from "@/lib/logger";

import type { Chunk, Chapter } from "@/types";

/**
 * Parses a YouTube-style timestamp (MM:SS or HH:MM:SS) to seconds
 */
function parseYouTubeTimestamp(timestamp: string): number {
  if (!timestamp) return 0;
  const parts = timestamp.trim().split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Fetches chapters for a video, checking both the flat document field
 * and the legacy chunks sub-collection.
 *
 * @param videoId - YouTube video ID
 * @returns Array of chapters sorted by time, empty array if none found
 */
export async function getChaptersByVideoId(videoId: string): Promise<Chapter[]> {
  if (!videoId?.trim()) {
    return [];
  }

  try {
    const db = await getFirestoreClient();
    const docRef = db.collection(COLLECTION_EPISODES).doc(videoId);

    // 1. Try flat "chapters" field on the document (IAra format)
    const doc = await docRef.get();
    if (doc.exists) {
      const data = doc.data();
      const chapters = data?.chapters;
      if (Array.isArray(chapters) && chapters.length > 0) {
        return chapters
          .filter((ch: { timestamp?: string; title?: string }) => ch.timestamp && ch.title)
          .map((ch: { timestamp: string; title: string }) => ({
            startTime: parseYouTubeTimestamp(ch.timestamp),
            topic: ch.title,
          }));
      }
    }

    // 2. Fallback: legacy chunks sub-collection
    const snapshot = await docRef
      .collection("chunks")
      .orderBy("metadata.chunk_index", "asc")
      .get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs
      .map((chunkDoc) => {
        const data = chunkDoc.data() as Omit<Chunk, "id">;
        const metadata = data.metadata;

        if (!metadata?.start_time || !metadata?.topic) {
          logger.warn("Chunk missing required metadata, skipping", {
            service: "chunks",
            chunkId: chunkDoc.id,
          });
          return null;
        }

        return {
          startTime: parseSrtTimestamp(metadata.start_time),
          topic: metadata.topic,
        };
      })
      .filter((chapter): chapter is Chapter => chapter !== null);
  } catch (error) {
    logger.warn("Failed to fetch chapters for video", {
      service: "chunks",
      videoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
