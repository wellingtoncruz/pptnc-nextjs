/**
 * Unit tests for POST /api/news/[newsId]/search-episodes route handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast',
}))

vi.mock('@/lib/firebase/videos-admin', () => ({
  searchEpisodesByTitle: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { POST } from './route'
import { auth } from '@/lib/auth'
import { searchEpisodesByTitle } from '@/lib/firebase/videos-admin'

const mockAuth = vi.mocked(auth)
const mockSearchEpisodes = vi.mocked(searchEpisodesByTitle)

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/news/news-1/search-episodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeContext(newsId = 'news-1') {
  return { params: Promise.resolve({ newsId }) }
}

describe('POST /api/news/[newsId]/search-episodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { email: 'test@test.com' } } as never)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValueOnce(null as never)

    const response = await POST(makeRequest({ query: 'test' }), makeContext())
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns 400 when query is missing', async () => {
    const response = await POST(makeRequest({}), makeContext())
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('BAD_REQUEST')
  })

  it('returns 400 when query is empty string', async () => {
    const response = await POST(makeRequest({ query: '   ' }), makeContext())
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('BAD_REQUEST')
  })

  it('returns episodes on successful search', async () => {
    const mockEpisodes = [
      { id: 'ep-1', title: 'Episódio sobre IA', duration: 3600, status: 'ready', videoType: 'episode' },
    ]
    mockSearchEpisodes.mockResolvedValueOnce(mockEpisodes as never)

    const response = await POST(makeRequest({ query: 'IA' }), makeContext())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.episodes).toEqual(mockEpisodes)
    expect(mockSearchEpisodes).toHaveBeenCalledWith('test-podcast', 'IA')
  })

  it('returns empty array when no episodes match', async () => {
    mockSearchEpisodes.mockResolvedValueOnce([])

    const response = await POST(makeRequest({ query: 'nonexistent' }), makeContext())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.episodes).toEqual([])
  })

  it('returns 500 on internal error', async () => {
    mockSearchEpisodes.mockRejectedValueOnce(new Error('Firestore error'))

    const response = await POST(makeRequest({ query: 'test' }), makeContext())
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })

  it('trims whitespace from query', async () => {
    mockSearchEpisodes.mockResolvedValueOnce([])

    await POST(makeRequest({ query: '  IA  ' }), makeContext())

    expect(mockSearchEpisodes).toHaveBeenCalledWith('test-podcast', 'IA')
  })
})
