import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

const mockFindEpisodesForNews = vi.fn()
vi.mock('@/lib/news/find-episodes', () => ({
  findEpisodesForNews: (...args: unknown[]) => mockFindEpisodesForNews(...args),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { POST } from './route'

const mockEpisodes = [
  { id: 'ep-1', title: 'AI Episode', description: 'About AI', duration: 3600, status: 'ready', videoType: 'episode' },
  { id: 'ep-2', title: 'ML Episode', description: 'About ML', duration: 7200, status: 'ready', videoType: 'episode' },
]

describe('POST /api/news/[newsId]/find-episodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com' } })
    mockFindEpisodesForNews.mockResolvedValue(mockEpisodes)
  })

  function createRequest(): NextRequest {
    return new NextRequest('http://localhost/api/news/news-1/find-episodes', { method: 'POST' })
  }

  it('returns episodes on success', async () => {
    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.episodes).toHaveLength(2)
    expect(body.data.episodes[0].id).toBe('ep-1')
  })

  it('calls findEpisodesForNews with correct params', async () => {
    await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(mockFindEpisodesForNews).toHaveBeenCalledWith('pptnc', 'news-1')
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)

    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(401)
  })

  it('returns 401 when session has error', async () => {
    mockAuth.mockResolvedValue({ error: 'TokenExpired' })

    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(401)
  })

  it('returns 404 when news not found', async () => {
    mockFindEpisodesForNews.mockRejectedValue(new Error('News not found'))

    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'nonexistent' }) })

    expect(response.status).toBe(404)
  })

  it('returns 400 when newsId is empty', async () => {
    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: '' }) })

    expect(response.status).toBe(400)
  })

  it('returns 500 on internal error', async () => {
    mockFindEpisodesForNews.mockRejectedValue(new Error('Vertex AI unavailable'))

    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(500)
  })
})
