import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGetNewsById = vi.fn()
const mockGetNewsEmbedding = vi.fn()
const mockUpdateNewsRelatedVideos = vi.fn()
vi.mock('@/lib/firebase/news-admin', () => ({
  getNewsById: (...args: unknown[]) => mockGetNewsById(...args),
  getNewsEmbedding: (...args: unknown[]) => mockGetNewsEmbedding(...args),
  updateNewsRelatedVideos: (...args: unknown[]) => mockUpdateNewsRelatedVideos(...args),
}))

const mockEmbedNews = vi.fn()
vi.mock('@/lib/embedding/news-embedding', () => ({
  embedNews: (...args: unknown[]) => mockEmbedNews(...args),
}))

const mockFindSimilarEpisodes = vi.fn()
vi.mock('@/lib/firebase/videos-admin', () => ({
  findSimilarEpisodes: (...args: unknown[]) => mockFindSimilarEpisodes(...args),
  getVideoAdmin: vi.fn(),
}))

const mockGetVideoSummariesByIds = vi.fn()
vi.mock('./get-video-summaries', () => ({
  getVideoSummariesByIds: (...args: unknown[]) => mockGetVideoSummariesByIds(...args),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { findEpisodesForNews } from './find-episodes'

const mockTimestamp = { toDate: () => new Date(), toMillis: () => 0, seconds: 0, nanoseconds: 0 }

const mockNews = {
  id: 'news-1',
  titulo: 'AI Revolution',
  descricao: 'New AI tools emerge',
  resumo: 'Summary of AI news',
  comentarios: 'Expert comments on AI',
  data: '2024-01-15',
  fonte: { nome: 'TechCrunch', url: 'https://techcrunch.com' },
  importedAt: mockTimestamp,
}

const mockEpisodes = [
  { id: 'ep-1', title: 'AI Episode', description: 'About AI', duration: 3600, status: 'ready', videoType: 'episode' },
  { id: 'ep-2', title: 'ML Episode', description: 'About ML', duration: 7200, status: 'ready', videoType: 'episode' },
]

describe('findEpisodesForNews (Story 18.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetNewsById.mockResolvedValue(mockNews)
    mockGetNewsEmbedding.mockResolvedValue(null)
    mockEmbedNews.mockResolvedValue(undefined)
    mockFindSimilarEpisodes.mockResolvedValue(mockEpisodes)
    mockUpdateNewsRelatedVideos.mockResolvedValue(undefined)
    mockGetVideoSummariesByIds.mockResolvedValue(mockEpisodes)
  })

  it('generates embedding and finds similar episodes (fresh flow)', async () => {
    const mockVector = Array.from({ length: 768 }, () => 0.1)
    mockGetNewsEmbedding.mockResolvedValueOnce(null)
    mockEmbedNews.mockResolvedValueOnce(mockVector)

    const result = await findEpisodesForNews('pptnc', 'news-1')

    expect(mockGetNewsById).toHaveBeenCalledWith('pptnc', 'news-1')
    expect(mockEmbedNews).toHaveBeenCalledWith('pptnc', 'news-1', 'AI Revolution', 'New AI tools emerge', 'Expert comments on AI')
    expect(mockFindSimilarEpisodes).toHaveBeenCalledWith('pptnc', mockVector, 5)
    expect(mockUpdateNewsRelatedVideos).toHaveBeenCalledWith('pptnc', 'news-1', ['ep-1', 'ep-2'])
    expect(result).toEqual(mockEpisodes)
  })

  it('reuses existing embedding (does NOT regenerate)', async () => {
    const mockVector = Array.from({ length: 768 }, () => 0.2)
    mockGetNewsEmbedding.mockResolvedValue(mockVector)

    const result = await findEpisodesForNews('pptnc', 'news-1')

    expect(mockEmbedNews).not.toHaveBeenCalled()
    expect(mockFindSimilarEpisodes).toHaveBeenCalledWith('pptnc', mockVector, 5)
    expect(result).toEqual(mockEpisodes)
  })

  it('returns cached episodes when related_videos already exist (AC 5)', async () => {
    const newsWithRelated = { ...mockNews, related_videos: ['ep-1', 'ep-2'] }
    mockGetNewsById.mockResolvedValue(newsWithRelated)

    const result = await findEpisodesForNews('pptnc', 'news-1')

    expect(mockGetVideoSummariesByIds).toHaveBeenCalledWith('pptnc', ['ep-1', 'ep-2'])
    expect(mockEmbedNews).not.toHaveBeenCalled()
    expect(mockFindSimilarEpisodes).not.toHaveBeenCalled()
    expect(result).toEqual(mockEpisodes)
  })

  it('throws when news document does not exist', async () => {
    mockGetNewsById.mockResolvedValue(null)

    await expect(findEpisodesForNews('pptnc', 'nonexistent')).rejects.toThrow(
      'News not found'
    )
  })

  it('persists related_videos after finding episodes', async () => {
    const mockVector = Array.from({ length: 768 }, () => 0.1)
    mockGetNewsEmbedding.mockResolvedValueOnce(null)
    mockEmbedNews.mockResolvedValueOnce(mockVector)

    await findEpisodesForNews('pptnc', 'news-1')

    expect(mockUpdateNewsRelatedVideos).toHaveBeenCalledWith('pptnc', 'news-1', ['ep-1', 'ep-2'])
  })
})
