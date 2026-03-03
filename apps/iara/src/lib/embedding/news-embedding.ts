/**
 * News embedding service — orchestrates embedding generation and persistence for news.
 *
 * Builds text from news fields (titulo, descricao, comentarios),
 * generates embedding via Vertex AI, and persists vector to news document.
 *
 * @see epic-18-aperfeicoamento-aba-noticias.md — Story 18.3
 */

import { generateEmbedding } from './vertex-ai'
import { updateNewsEmbedding } from '@/lib/firebase/news-admin'

const FALLBACK_TEXT = 'Notícia sem conteúdo'

/**
 * Builds the text to embed from news fields.
 * Filters out empty/whitespace-only fields and joins with newline.
 * Returns fallback text if all fields are empty.
 */
export function buildNewsEmbeddingText(titulo: string, descricao: string, comentarios: string): string {
  const parts = [titulo, descricao, comentarios].filter(s => s.trim())
  return parts.length > 0 ? parts.join('\n') : FALLBACK_TEXT
}

/**
 * Generates and persists embedding for a news document.
 *
 * @param podcastId - Podcast document ID
 * @param newsId - News document ID
 * @param titulo - News title
 * @param descricao - News description
 * @param comentarios - News comments
 * @returns The generated embedding vector
 * @throws Error on embedding generation or persistence failure
 */
export async function embedNews(
  podcastId: string,
  newsId: string,
  titulo: string,
  descricao: string,
  comentarios: string
): Promise<number[]> {
  const text = buildNewsEmbeddingText(titulo, descricao, comentarios)
  const vector = await generateEmbedding(text)
  await updateNewsEmbedding(podcastId, newsId, vector)
  return vector
}
