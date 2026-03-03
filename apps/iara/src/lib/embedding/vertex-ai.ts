/**
 * Vertex AI embedding service using @google/genai SDK.
 *
 * Generates text embeddings via the text-embedding-004 model.
 * Reuses the existing GoogleGenAI singleton from the LLM client.
 *
 * @see epic-17-video-embeddings.md
 */

import { getAI } from '@/lib/llm/client'

const EMBEDDING_MODEL = 'text-embedding-004'
const EMBEDDING_DIMENSIONS = 768
const FALLBACK_TEXT = 'Vídeo sem título e descrição'

/**
 * Normalizes text for embedding, applying fallback for empty input.
 */
function normalizeText(text: string): string {
  const trimmed = text.trim()
  return trimmed || FALLBACK_TEXT
}

/**
 * Generates embedding for a single text.
 * Returns number[] with 768 dimensions.
 *
 * @param text - Text to embed. Empty/whitespace uses fallback text.
 * @throws Error on Vertex AI failure (caller decides handling).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const normalizedText = normalizeText(text)

  const response = await getAI().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: normalizedText,
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  })

  const embedding = response.embeddings?.[0]?.values
  if (!embedding) {
    throw new Error('Vertex AI returned empty embedding response')
  }
  return embedding
}

/**
 * Generates embeddings in batch.
 * Returns array of vectors in the same order as inputs.
 *
 * @param texts - Array of texts to embed. Empty/whitespace entries use fallback text.
 * @throws Error on Vertex AI failure (caller decides handling).
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const normalizedTexts = texts.map(normalizeText)

  const response = await getAI().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: normalizedTexts,
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  })

  if (!response.embeddings || response.embeddings.length !== normalizedTexts.length) {
    throw new Error(
      `Vertex AI returned ${response.embeddings?.length ?? 0} embeddings for ${normalizedTexts.length} inputs`
    )
  }

  return response.embeddings.map((e, i) => {
    if (!e.values) {
      throw new Error(`Vertex AI returned empty values for embedding at index ${i}`)
    }
    return e.values
  })
}
