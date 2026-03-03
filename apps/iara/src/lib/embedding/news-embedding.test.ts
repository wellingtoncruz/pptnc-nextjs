import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGenerateEmbedding = vi.fn()
vi.mock('./vertex-ai', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}))

const mockUpdateNewsEmbedding = vi.fn()
vi.mock('@/lib/firebase/news-admin', () => ({
  updateNewsEmbedding: (...args: unknown[]) => mockUpdateNewsEmbedding(...args),
}))

import { buildNewsEmbeddingText, embedNews } from './news-embedding'

describe('buildNewsEmbeddingText', () => {
  it('concatenates all fields with newline', () => {
    expect(buildNewsEmbeddingText('Título', 'Descrição', 'Comentários')).toBe(
      'Título\nDescrição\nComentários'
    )
  })

  it('skips empty fields', () => {
    expect(buildNewsEmbeddingText('Título', '', 'Comentários')).toBe(
      'Título\nComentários'
    )
  })

  it('skips all empty fields and returns fallback', () => {
    expect(buildNewsEmbeddingText('', '', '')).toBe('Notícia sem conteúdo')
  })

  it('trims whitespace-only fields', () => {
    expect(buildNewsEmbeddingText('Título', '  ', '')).toBe('Título')
  })
})

describe('embedNews', () => {
  const mockVector = Array.from({ length: 768 }, (_, i) => i * 0.001)

  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateEmbedding.mockResolvedValue(mockVector)
    mockUpdateNewsEmbedding.mockResolvedValue(undefined)
  })

  it('generates embedding, persists it, and returns the vector', async () => {
    const result = await embedNews('pptnc', 'news-1', 'Título', 'Descrição', 'Comentários')

    expect(mockGenerateEmbedding).toHaveBeenCalledWith('Título\nDescrição\nComentários')
    expect(mockUpdateNewsEmbedding).toHaveBeenCalledWith('pptnc', 'news-1', mockVector)
    expect(result).toBe(mockVector)
  })

  it('handles empty fields correctly', async () => {
    await embedNews('pptnc', 'news-2', 'Só título', '', '')

    expect(mockGenerateEmbedding).toHaveBeenCalledWith('Só título')
  })

  it('uses fallback text when all fields are empty', async () => {
    await embedNews('pptnc', 'news-3', '', '', '')

    expect(mockGenerateEmbedding).toHaveBeenCalledWith('Notícia sem conteúdo')
  })

  it('propagates Vertex AI errors', async () => {
    mockGenerateEmbedding.mockRejectedValueOnce(new Error('Vertex AI unavailable'))

    await expect(embedNews('pptnc', 'news-4', 'Título', '', '')).rejects.toThrow(
      'Vertex AI unavailable'
    )
  })

  it('propagates Firestore persistence errors', async () => {
    mockUpdateNewsEmbedding.mockRejectedValueOnce(new Error('Firestore write failed'))

    await expect(embedNews('pptnc', 'news-5', 'Título', '', '')).rejects.toThrow(
      'Firestore write failed'
    )
  })
})
