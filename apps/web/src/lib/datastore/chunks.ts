/**
 * Firestore functions for fetching video chunks (chapters)
 * Sub-collection: videos/{videoId}/chunks
 */

import { getFirestoreClient, COLLECTION_EPISODES } from "./client";
import { parseSrtTimestamp } from "@/lib/transcript";
import { logger } from "@/lib/logger";

import type { Chunk, Chapter } from "@/types";

// Note: Chunk type is used for internal type assertion only

/**
 * Fetches chapters for a video from Firestore chunks sub-collection
 * Transforms raw Firestore chunks into Chapter objects for UI
 *
 * @param videoId - YouTube video ID
 * @returns Array of chapters sorted by chunk_index, empty array if none found
 */
export async function getChaptersByVideoId(videoId: string): Promise<Chapter[]> {
  if (!videoId?.trim()) {
    return [];
  }

  try {
    const db = await getFirestoreClient();

    // Access sub-collection: videos/{videoId}/chunks
    const chunksRef = db
      .collection(COLLECTION_EPISODES) // "videos"
      .doc(videoId)
      .collection("chunks");

    const snapshot = await chunksRef
      .orderBy("metadata.chunk_index", "asc")
      .get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs
      .map((doc) => {
        const data = doc.data() as Omit<Chunk, "id">;
        const metadata = data.metadata;

        // Skip chunks without required metadata
        if (!metadata?.start_time || !metadata?.topic) {
          logger.warn("Chunk missing required metadata, skipping", {
            service: "chunks",
            chunkId: doc.id,
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
    logger.warn("Failed to fetch chunks for video", {
      service: "chunks",
      videoId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
