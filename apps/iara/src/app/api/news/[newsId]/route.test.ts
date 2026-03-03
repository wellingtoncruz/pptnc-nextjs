import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

const mockGetNewsById = vi.fn()
const mockUpdateNewsFields = vi.fn()
vi.mock('@/lib/firebase/news-admin', () => ({
  getNewsById: (...args: unknown[]) => mockGetNewsById(...args),
  updateNewsFields: (...args: unknown[]) => mockUpdateNewsFields(...args),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { GET, PATCH } from './route'

const mockTimestamp = { toDate: () => new Date(), toMillis: () => 0, seconds: 0, nanoseconds: 0 }

describe('GET /api/news/[newsId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com' } })
  })

  it('returns news document on success', async () => {
    mockGetNewsById.mockResolvedValue({
      id: 'news-1',
      titulo: 'Test News',
      descricao: 'Desc',
      importedAt: mockTimestamp,
    })

    const request = new NextRequest('http://localhost/api/news/news-1')
    const response = await GET(request, { params: Promise.resolve({ newsId: 'news-1' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.titulo).toBe('Test News')
  })

  it('returns 404 when not found', async () => {
    mockGetNewsById.mockResolvedValue(null)

    const request = new NextRequest('http://localhost/api/news/nonexistent')
    const response = await GET(request, { params: Promise.resolve({ newsId: 'nonexistent' }) })

    expect(response.status).toBe(404)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)

    const request = new NextRequest('http://localhost/api/news/news-1')
    const response = await GET(request, { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(401)
  })

  it('returns 400 for empty newsId', async () => {
    const request = new NextRequest('http://localhost/api/news/')
    const response = await GET(request, { params: Promise.resolve({ newsId: '' }) })

    expect(response.status).toBe(400)
  })
})

describe('PATCH /api/news/[newsId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com' } })
    mockUpdateNewsFields.mockResolvedValue(undefined)
  })

  function createRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost/api/news/news-1', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('updates selected_video with invalidation', async () => {
    const response = await PATCH(
      createRequest({ selected_video: 'new-ep' }),
      { params: Promise.resolve({ newsId: 'news-1' }) }
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toHaveProperty('updatedAt')
    expect(mockUpdateNewsFields).toHaveBeenCalledWith('pptnc', 'news-1', { selected_video: 'new-ep' })
  })

  it('updates social (auto-save)', async () => {
    const response = await PATCH(
      createRequest({ social: 'Texto editado' }),
      { params: Promise.resolve({ newsId: 'news-1' }) }
    )

    expect(response.status).toBe(200)
    expect(mockUpdateNewsFields).toHaveBeenCalledWith('pptnc', 'news-1', { social: 'Texto editado' })
  })

  it('updates both selected_video and social together', async () => {
    await PATCH(
      createRequest({ selected_video: 'ep-2', social: 'New text' }),
      { params: Promise.resolve({ newsId: 'news-1' }) }
    )

    expect(mockUpdateNewsFields).toHaveBeenCalledWith('pptnc', 'news-1', { selected_video: 'ep-2', social: 'New text' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)

    const response = await PATCH(
      createRequest({ social: 'test' }),
      { params: Promise.resolve({ newsId: 'news-1' }) }
    )

    expect(response.status).toBe(401)
  })

  it('returns 400 for empty body', async () => {
    const response = await PATCH(
      createRequest({}),
      { params: Promise.resolve({ newsId: 'news-1' }) }
    )

    expect(response.status).toBe(400)
  })

  it('returns 400 for invalid body fields', async () => {
    const response = await PATCH(
      createRequest({ unknown_field: 'value' }),
      { params: Promise.resolve({ newsId: 'news-1' }) }
    )

    expect(response.status).toBe(400)
  })

  it('returns 500 on Firestore error', async () => {
    mockUpdateNewsFields.mockRejectedValue(new Error('Firestore write failed'))

    const response = await PATCH(
      createRequest({ social: 'test' }),
      { params: Promise.resolve({ newsId: 'news-1' }) }
    )

    expect(response.status).toBe(500)
  })
})
