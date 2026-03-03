import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock vertex-ai service
const mockGenerateEmbedding = vi.fn()
vi.mock('@/lib/embedding/vertex-ai', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}))

// Mock videos-admin persistence
const mockUpdateVideoEmbedding = vi.fn()
vi.mock('@/lib/firebase/videos-admin', () => ({
  updateVideoEmbedding: (...args: unknown[]) => mockUpdateVideoEmbedding(...args),
}))

// Mock logger
const mockLog = vi.fn()
vi.mock('@/lib/logger', () => ({
  log: (...args: unknown[]) => mockLog(...args),
}))

import { embedVideo, embedVideos } from './video-embedding'

describe('video-embedding service', () => {
  const mockVector = Array.from({ length: 768 }, (_, i) => i * 0.001)

  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateEmbedding.mockResolvedValue(mockVector)
    mockUpdateVideoEmbedding.mockResolvedValue(undefined)
  })

  describe('embedVideo', () => {
    it('concatenates title and description, generates embedding, and persists', async () => {
      await embedVideo('pptnc', 'video-1', 'My Title', 'My Description')

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('My Title My Description')
      expect(mockUpdateVideoEmbedding).toHaveBeenCalledWith('pptnc', 'video-1', mockVector)
    })

    it('handles title-only (no description)', async () => {
      await embedVideo('pptnc', 'video-1', 'Just a Title')

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('Just a Title')
    })

    it('handles title-only (empty description)', async () => {
      await embedVideo('pptnc', 'video-1', 'Just a Title', '')

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('Just a Title')
    })

    it('uses fallback when title and description are empty', async () => {
      await embedVideo('pptnc', 'video-1', '', '')

      // generateEmbedding receives empty string, vertex-ai.ts handles fallback internally
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('')
    })

    it('propagates errors from generateEmbedding', async () => {
      mockGenerateEmbedding.mockRejectedValue(new Error('RATE_LIMIT'))

      await expect(embedVideo('pptnc', 'v1', 'title')).rejects.toThrow('RATE_LIMIT')
      expect(mockUpdateVideoEmbedding).not.toHaveBeenCalled()
    })

    it('propagates errors from updateVideoEmbedding', async () => {
      mockUpdateVideoEmbedding.mockRejectedValue(new Error('FIRESTORE_ERROR'))

      await expect(embedVideo('pptnc', 'v1', 'title')).rejects.toThrow('FIRESTORE_ERROR')
    })
  })

  describe('embedVideos', () => {
    it('processes multiple videos and returns success/fail counts', async () => {
      const videos = [
        { videoId: 'v1', title: 'Title 1', description: 'Desc 1' },
        { videoId: 'v2', title: 'Title 2', description: 'Desc 2' },
        { videoId: 'v3', title: 'Title 3' },
      ]

      const result = await embedVideos('pptnc', videos)

      expect(result).toEqual({ succeeded: 3, failed: 0 })
      expect(mockGenerateEmbedding).toHaveBeenCalledTimes(3)
      expect(mockUpdateVideoEmbedding).toHaveBeenCalledTimes(3)
    })

    it('continues processing when individual video fails (best-effort)', async () => {
      mockGenerateEmbedding
        .mockResolvedValueOnce(mockVector) // v1 succeeds
        .mockRejectedValueOnce(new Error('TIMEOUT')) // v2 fails
        .mockResolvedValueOnce(mockVector) // v3 succeeds

      const videos = [
        { videoId: 'v1', title: 'Title 1' },
        { videoId: 'v2', title: 'Title 2' },
        { videoId: 'v3', title: 'Title 3' },
      ]

      const result = await embedVideos('pptnc', videos)

      expect(result).toEqual({ succeeded: 2, failed: 1 })
      expect(mockUpdateVideoEmbedding).toHaveBeenCalledTimes(2)
      expect(mockLog).toHaveBeenCalledWith('WARN', 'Failed to embed video', expect.objectContaining({
        podcastId: 'pptnc',
        videoId: 'v2',
        error: 'TIMEOUT',
      }))
    })

    it('returns zero counts for empty input', async () => {
      const result = await embedVideos('pptnc', [])

      expect(result).toEqual({ succeeded: 0, failed: 0 })
      expect(mockGenerateEmbedding).not.toHaveBeenCalled()
    })

    it('concatenates title and description for each video', async () => {
      const videos = [
        { videoId: 'v1', title: 'Title', description: 'Description' },
      ]

      await embedVideos('pptnc', videos)

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('Title Description')
    })

    it('handles missing description in batch', async () => {
      const videos = [
        { videoId: 'v1', title: 'Only Title' },
      ]

      await embedVideos('pptnc', videos)

      expect(mockGenerateEmbedding).toHaveBeenCalledWith('Only Title')
    })
  })
})
