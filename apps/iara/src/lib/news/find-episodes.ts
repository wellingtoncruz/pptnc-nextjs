/**
 * Orchestrates finding similar episodes for a news item.
 *
 * Flow:
 * 1. Read the news document
 * 2. If related_videos already cached → fetch those videos and return (AC 5)
 * 3. If no embedding → generate via embedNews()
 * 4. Call findSimilarEpisodes() with the embedding vector
 * 5. Persist the video IDs as related_videos
 * 6. Return the episode summaries
 *
 * @see Story 18.3 — Embedding de Notícias + Busca de Episódios Similares
 */

import { log } from '@/lib/logger'
import { getNewsById, getNewsEmbedding, updateNewsRelatedVideos } from '@/lib/firebase/news-admin'
import { embedNews } from '@/lib/embedding/news-embedding'
import { findSimilarEpisodes } from '@/lib/firebase/videos-admin'
import { getVideoSummariesByIds } from './get-video-summaries'
import type { VideoSummary } from '@/types/video'

const SIMILAR_EPISODES_LIMIT = 5

/**
 * Finds episodes related to a news item.
 *
 * @param podcastId - The podcast ID
 * @param newsId - The news document ID
 * @returns Array of similar episode summaries
 * @throws Error if news document not found
 */
export async function findEpisodesForNews(
  podcastId: string,
  newsId: string
): Promise<VideoSummary[]> {
  // 1. Read news document
  const news = await getNewsById(podcastId, newsId)
  if (!news) {
    throw new Error('News not found')
  }

  // 2. If related_videos cached → return cached episodes (AC 5)
  if (news.related_videos && news.related_videos.length > 0) {
    log('INFO', 'Returning cached related episodes for news', { podcastId, newsId, count: news.related_videos.length })
    return getVideoSummariesByIds(podcastId, news.related_videos)
  }

  // 3. Get or generate embedding (embedNews returns vector directly, avoiding redundant read)
  const embedding = await getNewsEmbedding(podcastId, newsId)
    ?? await embedNews(podcastId, newsId, news.titulo, news.descricao, news.comentarios)

  // 4. Find similar episodes
  const episodes = await findSimilarEpisodes(podcastId, embedding, SIMILAR_EPISODES_LIMIT)

  // 5. Persist related_videos
  const videoIds = episodes.map(ep => ep.id)
  await updateNewsRelatedVideos(podcastId, newsId, videoIds)

  log('INFO', 'Found similar episodes for news', {
    podcastId,
    newsId,
    episodesFound: episodes.length,
  })

  // 6. Return episodes
  return episodes
}
