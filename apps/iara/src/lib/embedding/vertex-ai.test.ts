import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the LLM client
const mockEmbedContent = vi.fn()

vi.mock('@/lib/llm/client', () => ({
  getAI: vi.fn(() => ({
    models: {
      embedContent: mockEmbedContent,
    },
  })),
}))

import { generateEmbedding, generateEmbeddings } from './vertex-ai'

describe('vertex-ai embedding service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateEmbedding', () => {
    it('calls embedContent with correct parameters and returns vector', async () => {
      const mockVector = Array.from({ length: 768 }, (_, i) => i * 0.001)
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: mockVector }],
      })

      const result = await generateEmbedding('test text for embedding')

      expect(mockEmbedContent).toHaveBeenCalledWith({
        model: 'text-embedding-004',
        contents: 'test text for embedding',
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: 768,
        },
      })
      expect(result).toEqual(mockVector)
      expect(result).toHaveLength(768)
    })

    it('uses fallback text when input is empty', async () => {
      const mockVector = Array.from({ length: 768 }, () => 0.5)
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: mockVector }],
      })

      await generateEmbedding('')

      expect(mockEmbedContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: 'Vídeo sem título e descrição',
        })
      )
    })

    it('uses fallback text when input is only whitespace', async () => {
      const mockVector = Array.from({ length: 768 }, () => 0.5)
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: mockVector }],
      })

      await generateEmbedding('   ')

      expect(mockEmbedContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: 'Vídeo sem título e descrição',
        })
      )
    })

    it('propagates errors from Vertex AI without silencing', async () => {
      mockEmbedContent.mockRejectedValue(new Error('RATE_LIMIT_EXCEEDED'))

      await expect(generateEmbedding('some text')).rejects.toThrow('RATE_LIMIT_EXCEEDED')
    })

    it('propagates timeout errors', async () => {
      mockEmbedContent.mockRejectedValue(new Error('DEADLINE_EXCEEDED'))

      await expect(generateEmbedding('some text')).rejects.toThrow('DEADLINE_EXCEEDED')
    })

    it('throws descriptive error when response has no embeddings', async () => {
      mockEmbedContent.mockResolvedValue({ embeddings: [] })

      await expect(generateEmbedding('text')).rejects.toThrow('Vertex AI returned empty embedding response')
    })

    it('throws descriptive error when embeddings is undefined', async () => {
      mockEmbedContent.mockResolvedValue({})

      await expect(generateEmbedding('text')).rejects.toThrow('Vertex AI returned empty embedding response')
    })
  })

  describe('generateEmbeddings', () => {
    it('calls embedContent with array of texts and returns vectors in order', async () => {
      const texts = ['text one', 'text two', 'text three']
      const mockVectors = texts.map((_, i) =>
        Array.from({ length: 768 }, () => i * 0.1)
      )
      mockEmbedContent.mockResolvedValue({
        embeddings: mockVectors.map(v => ({ values: v })),
      })

      const result = await generateEmbeddings(texts)

      expect(mockEmbedContent).toHaveBeenCalledWith({
        model: 'text-embedding-004',
        contents: texts,
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: 768,
        },
      })
      expect(result).toHaveLength(3)
      expect(result[0]).toEqual(mockVectors[0])
      expect(result[1]).toEqual(mockVectors[1])
      expect(result[2]).toEqual(mockVectors[2])
    })

    it('applies fallback for empty strings in batch', async () => {
      const texts = ['valid text', '', '  ']
      const mockVectors = texts.map(() =>
        Array.from({ length: 768 }, () => 0.5)
      )
      mockEmbedContent.mockResolvedValue({
        embeddings: mockVectors.map(v => ({ values: v })),
      })

      await generateEmbeddings(texts)

      expect(mockEmbedContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: ['valid text', 'Vídeo sem título e descrição', 'Vídeo sem título e descrição'],
        })
      )
    })

    it('returns empty array for empty input', async () => {
      const result = await generateEmbeddings([])

      expect(result).toEqual([])
      expect(mockEmbedContent).not.toHaveBeenCalled()
    })

    it('propagates errors from Vertex AI', async () => {
      mockEmbedContent.mockRejectedValue(new Error('SERVICE_UNAVAILABLE'))

      await expect(generateEmbeddings(['text'])).rejects.toThrow('SERVICE_UNAVAILABLE')
    })
  })
})
