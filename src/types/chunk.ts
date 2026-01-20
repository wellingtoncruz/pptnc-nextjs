/**
 * Metadata associated with a transcript chunk
 * Stored in Firestore: videos/{videoId}/chunks/{chunkId}
 */
export interface ChunkMetadata {
  /** YouTube video ID */
  video_id: string;
  /** Index of the chunk for ordering */
  chunk_index: number;
  /** Topic/chapter name for this chunk */
  topic: string;
  /** Start time in SRT format (HH:MM:SS,mmm) */
  start_time: string;
  /** End time in SRT format (HH:MM:SS,mmm) */
  end_time: string;
}

/**
 * A transcript chunk as stored in Firestore
 * Sub-collection path: videos/{videoId}/chunks/{chunkId}
 */
export interface Chunk {
  /** Firestore document ID */
  id: string;
  /** Chunk metadata including timing and topic */
  metadata: ChunkMetadata;
  /** Full text content of the chunk (optional, not needed for chapters UI) */
  content?: string;
}

/**
 * Chapter representation for UI display
 * Simplified version of Chunk with parsed timestamp
 */
export interface Chapter {
  /** Start time in seconds (parsed from SRT format) */
  startTime: number;
  /** Chapter/topic name */
  topic: string;
}
