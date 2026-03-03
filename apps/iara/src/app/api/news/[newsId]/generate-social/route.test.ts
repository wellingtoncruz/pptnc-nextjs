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

const mockGetVideoAdmin = vi.fn()
vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: (...args: unknown[]) => mockGetVideoAdmin(...args),
}))

const mockGetPodcastAdmin = vi.fn()
vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastAdmin: (...args: unknown[]) => mockGetPodcastAdmin(...args),
}))

const mockCallGenAI = vi.fn()
vi.mock('@/lib/llm/client', () => ({
  callGenAI: (...args: unknown[]) => mockCallGenAI(...args),
}))

const mockEnqueue = vi.fn()
vi.mock('@/lib/llm/queue', () => ({
  llmQueue: { enqueue: (fn: () => unknown) => mockEnqueue(fn) },
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { POST } from './route'

const mockTimestamp = { toDate: () => new Date(), toMillis: () => 0, seconds: 0, nanoseconds: 0 }

const mockNews = {
  id: 'news-1',
  titulo: 'AI News',
  descricao: 'About AI',
  comentarios: 'Experts say...',
  selected_video: 'ep-1',
  importedAt: mockTimestamp,
}

const mockVideo = {
  id: 'ep-1',
  title: 'AI Episode',
  description: 'Deep dive into AI',
}

const mockPodcast = {
  personas: { writer: { role: 'Writer', objective: 'Write', resume: 'Exp' } },
  prompts: { news: { news_social: { description: 'Write post', expectedOutput: 'Short text' } } },
}

describe('POST /api/news/[newsId]/generate-social', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { email: 'admin@test.com' } })
    mockGetNewsById.mockResolvedValue(mockNews)
    mockGetVideoAdmin.mockResolvedValue(mockVideo)
    mockGetPodcastAdmin.mockResolvedValue(mockPodcast)
    mockEnqueue.mockImplementation((fn: () => unknown) => fn())
    mockCallGenAI.mockResolvedValue({ data: { social: 'Post gerado pela IA' }, usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } })
    mockUpdateNewsFields.mockResolvedValue(undefined)
  })

  function createRequest(): NextRequest {
    return new NextRequest('http://localhost/api/news/news-1/generate-social', { method: 'POST' })
  }

  it('generates social text and returns it', async () => {
    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.social).toBe('Post gerado pela IA')
  })

  it('persists social text in news document', async () => {
    await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(mockUpdateNewsFields).toHaveBeenCalledWith('pptnc', 'news-1', { social: 'Post gerado pela IA' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)

    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(401)
  })

  it('returns 404 when news not found', async () => {
    mockGetNewsById.mockResolvedValue(null)

    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(404)
  })

  it('returns 400 when selected_video is missing', async () => {
    mockGetNewsById.mockResolvedValue({ ...mockNews, selected_video: undefined })

    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(400)
  })

  it('returns 404 when video not found', async () => {
    mockGetVideoAdmin.mockResolvedValue(null)

    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(404)
  })

  it('returns 400 when news_social prompt is not configured', async () => {
    mockGetPodcastAdmin.mockResolvedValue({
      personas: { writer: { role: 'Writer', objective: 'Write', resume: 'Exp' } },
      prompts: { news: {} },
    })

    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('MISSING_PROMPT')
  })

  it('returns 500 on LLM error', async () => {
    mockCallGenAI.mockRejectedValue(new Error('LLM failed'))

    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(500)
  })

  it('passes additionalContext from request body to prompt builder', async () => {
    const request = new NextRequest('http://localhost/api/news/news-1/generate-social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ additionalContext: 'Foque no impacto econômico' }),
    })

    const response = await POST(request, { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(200)
    // The LLM should have been called - verify via mockCallGenAI
    expect(mockCallGenAI).toHaveBeenCalled()
    // The user prompt (2nd arg to callGenAI) should contain the additional context
    const callArgs = mockCallGenAI.mock.calls[0]
    const userPrompt = callArgs[1] as string
    expect(userPrompt).toContain('Foque no impacto econômico')
  })

  it('works without additionalContext in request body (backward compatible)', async () => {
    const response = await POST(createRequest(), { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(200)
    // The user prompt should NOT contain additionalContext section
    const callArgs = mockCallGenAI.mock.calls[0]
    const userPrompt = callArgs[1] as string
    expect(userPrompt).not.toContain('# Instruções Adicionais do Produtor')
  })

  it('returns 400 when additionalContext exceeds max length', async () => {
    const longContext = 'a'.repeat(501)
    const request = new NextRequest('http://localhost/api/news/news-1/generate-social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ additionalContext: longContext }),
    })

    const response = await POST(request, { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when additionalContext is not a string', async () => {
    const request = new NextRequest('http://localhost/api/news/news-1/generate-social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ additionalContext: 123 }),
    })

    const response = await POST(request, { params: Promise.resolve({ newsId: 'news-1' }) })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})
