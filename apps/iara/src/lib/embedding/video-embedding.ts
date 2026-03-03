/**
 * Video embedding service — orchestrates embedding generation and persistence.
 *
 * Combines title + description text, generates embedding via Vertex AI,
 * and persists the vector to the video document in Firestore.
 *
 * @see epic-17-video-embeddings.md
 */

import { log } from '@/lib/logger'

import { generateEmbedding } from './vertex-ai'
import { updateVideoEmbedding } from '@/lib/firebase/videos-admin'

export interface VideoEmbeddingInput {
  videoId: string
  title: string
  description?: string
}

/**
 * Builds the text to embed from title and description.
 */
function buildEmbeddingText(title: string, description?: string): string {
  return `${title} ${description ?? ''}`.trim()
}

/**
 * Generates and persists embedding for a single video.
 *
 * @param podcastId - Podcast document ID
 * @param videoId - Video document ID
 * @param title - Video title
 * @param description - Optional video description
 * @throws Error on embedding generation or persistence failure (caller decides handling)
 */
export async function embedVideo(
  podcastId: string,
  videoId: string,
  title: string,
  description?: string
): Promise<void> {
  const text = buildEmbeddingText(title, description)
  const vector = await generateEmbedding(text)
  await updateVideoEmbedding(podcastId, videoId, vector)
}

/**
 * Generates and persists embeddings for multiple videos.
 * Best-effort: individual failures are logged but don't stop processing.
 *
 * @param podcastId - Podcast document ID
 * @param videos - Array of videos to embed
 * @returns Count of succeeded and failed embeddings
 */
export async function embedVideos(
  podcastId: string,
  videos: VideoEmbeddingInput[]
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0
  let failed = 0

  for (const video of videos) {
    try {
      await embedVideo(podcastId, video.videoId, video.title, video.description)
      succeeded++
    } catch (error) {
      failed++
      log('WARN', 'Failed to embed video', {
        podcastId,
        videoId: video.videoId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { succeeded, failed }
}
