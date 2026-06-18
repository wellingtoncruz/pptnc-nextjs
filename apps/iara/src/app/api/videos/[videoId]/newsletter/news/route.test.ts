import type { Session } from 'next-auth'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// --- Mocks ---

const mockAuthFn = vi.fn<() => Promise<Session | null>>()
vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

const mockGetVideoAdmin = vi.fn()
const mockGetPodcastAdmin = vi.fn()
vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: (...args: unknown[]) => mockGetVideoAdmin(...args),
}))
vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastAdmin: (...args: unknown[]) => mockGetPodcastAdmin(...args),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
}))

const mockListNewsByDate = vi.fn()
vi.mock('@/lib/firebase/news-admin', () => ({
  listNewsByDate: (...args: unknown[]) => mockListNewsByDate(...args),
}))

const mockGetNewsletterData = vi.fn()
const mockSaveNewsletterData = vi.fn()
vi.mock('@/lib/firebase/newsletter-admin', () => ({
  getNewsletterData: (...args: unknown[]) => mockGetNewsletterData(...args),
  saveNewsletterData: (...args: unknown[]) => mockSaveNewsletterData(...args),
}))

const mockCallGenAI = vi.fn()
vi.mock('@/lib/llm/client', () => ({
  callGenAI: (...args: unknown[]) => mockCallGenAI(...args),
}))

const mockEnqueue = vi.fn()
vi.mock('@/lib/llm/queue', () => ({
  llmQueue: {
    enqueue: (fn: () => Promise<unknown>) => mockEnqueue(fn),
  },
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { LLMError } from '@/lib/llm/errors'

import { POST, PATCH } from './route'

// --- Fixtures ---

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

function createContext(videoId: string) {
  return { params: Promise.resolve({ videoId }) }
}

function createPostRequest() {
  return new Request('http://localhost', {
    method: 'POST',
  })
}

function createPatchRequest(body: Record<string, unknown>) {
  return new Request('http://localhost', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const mockTimestamp = {
  toDate: () => new Date('2026-02-25T14:00:00Z'),
  toMillis: () => new Date('2026-02-25T14:00:00Z').getTime(),
  seconds: Math.floor(new Date('2026-02-25T14:00:00Z').getTime() / 1000),
  nanoseconds: 0,
}

const validEpisode = {
  id: 'video-1',
  title: 'Episódio sobre IA',
  description: 'Discussão sobre IA generativa',
  theme: 'Inteligência Artificial',
  videoType: 'episode',
  publishedAt: mockTimestamp,
  transcriptionTXT: 'Transcrição completa do episódio...',
}

const validPodcast = {
  id: 'pptnc',
  personas: {
    writer: {
      role: 'Redator de newsletters',
      objective: 'Criar newsletters engajantes',
      resume: '10 anos de experiência em jornalismo digital',
    },
  },
  prompts: {
    episode: {
      newsletter: {
        news: {
          description: 'Selecione as notícias mais relevantes para a newsletter',
          expectedOutput: 'IDs das 10 notícias mais aderentes',
        },
      },
    },
  },
}

function createNewsList(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `news-${i + 1}`,
    titulo: `Notícia ${i + 1}`,
    descricao: `Descrição da notícia ${i + 1}`,
    resumo: `Resumo ${i + 1}`,
    comentarios: '',
    data: '2026-02-23',
    fonte: { nome: `Fonte ${i + 1}`, url: `https://source${i + 1}.com` },
    importedAt: mockTimestamp,
  }))
}

// --- POST Tests ---

describe('POST /api/videos/[videoId]/newsletter/news', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockImplementation((fn: () => Promise<unknown>) => fn())
    mockGetNewsletterData.mockResolvedValue({ status: 'draft', draft: 'Some draft' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await POST(createPostRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns 404 when video not found', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(null)

    const response = await POST(createPostRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('returns 400 for non-episode video', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue({ ...validEpisode, videoType: 'cut' })

    const response = await POST(createPostRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
  })

  it('returns 200 with empty items when no news found for D-2', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockListNewsByDate.mockResolvedValue([])

    const response = await POST(createPostRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.items).toHaveLength(0)
    expect(json.data.totalFound).toBe(0)
    expect(json.data.llmFiltered).toBe(false)
  })

  it('returns candidates without LLM when < 10 news', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockListNewsByDate.mockResolvedValue(createNewsList(5))

    const response = await POST(createPostRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.items).toHaveLength(5)
    expect(json.data.totalFound).toBe(5)
    expect(json.data.llmFiltered).toBe(false)
    expect(mockCallGenAI).not.toHaveBeenCalled()
  })

  it('calls LLM to filter when >= 10 news', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockListNewsByDate.mockResolvedValue(createNewsList(12))
    mockCallGenAI.mockResolvedValue({
      data: { selectedIds: ['news-1', 'news-3', 'news-5', 'news-7', 'news-9', 'news-10', 'news-11', 'news-12', 'news-2', 'news-4'] },
      usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
    })

    const response = await POST(createPostRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.items).toHaveLength(10)
    expect(json.data.totalFound).toBe(12)
    expect(json.data.llmFiltered).toBe(true)
    expect(mockCallGenAI).toHaveBeenCalled()
  })

  it('maps fields from PT-BR to EN correctly', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockListNewsByDate.mockResolvedValue([{
      id: 'news-1',
      titulo: 'Título da Notícia',
      descricao: 'Descrição detalhada',
      resumo: 'Resumo',
      comentarios: '',
      data: '2026-02-23',
      fonte: { nome: 'TechCrunch', url: 'https://techcrunch.com/article' },
      importedAt: mockTimestamp,
    }])

    const response = await POST(createPostRequest(), createContext('video-1'))
    const json = await response.json()

    const item = json.data.items[0]
    expect(item.id).toBe('news-1')
    expect(item.title).toBe('Título da Notícia')
    expect(item.description).toBe('Descrição detalhada')
    expect(item.source).toBe('TechCrunch')
    expect(item.url).toBe('https://techcrunch.com/article')
    expect(item.publishedAt).toBe('2026-02-23')
  })

  it('returns 429 on LLM rate limit error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockListNewsByDate.mockResolvedValue(createNewsList(12))
    mockCallGenAI.mockRejectedValue(
      new LLMError('RATE_LIMIT', 'Limite de requisições atingido', true)
    )

    const response = await POST(createPostRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(429)
    expect(json.error.code).toBe('RATE_LIMIT')
  })

  it('queries news from the last 48 hours', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockListNewsByDate.mockResolvedValue([])

    const before = Date.now()
    await POST(createPostRequest(), createContext('video-1'))
    const after = Date.now()

    // Should pass rangeStart (48h ago) and rangeEnd (now) as Date objects
    const calledStart = mockListNewsByDate.mock.calls[0][1] as Date
    const calledEnd = mockListNewsByDate.mock.calls[0][2] as Date

    // rangeStart should be ~48h before now
    const expectedStart = before - 48 * 60 * 60 * 1000
    expect(calledStart.getTime()).toBeGreaterThanOrEqual(expectedStart - 1000)
    expect(calledStart.getTime()).toBeLessThanOrEqual(after - 48 * 60 * 60 * 1000 + 1000)

    // rangeEnd should be ~now
    expect(calledEnd.getTime()).toBeGreaterThanOrEqual(before)
    expect(calledEnd.getTime()).toBeLessThanOrEqual(after)
  })

  it('returns 422 when prompt config is missing and >= 10 news', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockListNewsByDate.mockResolvedValue(createNewsList(12))
    // Podcast without newsletter news prompt config
    mockGetPodcastAdmin.mockResolvedValue({ id: 'pptnc' })
    mockGetNewsletterData.mockResolvedValue({ status: 'draft', draft: 'Some draft' })

    const response = await POST(createPostRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(422)
    // Epic 27: config-missing virou LLMError('MISSING_CONTEXT') (mapeado p/ 422).
    expect(json.error.code).toBe('MISSING_CONTEXT')
    expect(mockCallGenAI).not.toHaveBeenCalled()
  })

  it('returns 500 on internal error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockRejectedValue(new Error('Firestore error'))

    const response = await POST(createPostRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })

  it('fetches newsletter data for draft context when LLM is called', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue({ status: 'draft', draft: 'Newsletter draft content' })
    mockListNewsByDate.mockResolvedValue(createNewsList(12))
    mockCallGenAI.mockResolvedValue({
      data: { selectedIds: ['news-1', 'news-2', 'news-3', 'news-4', 'news-5', 'news-6', 'news-7', 'news-8', 'news-9', 'news-10'] },
      usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
    })

    await POST(createPostRequest(), createContext('video-1'))

    expect(mockGetNewsletterData).toHaveBeenCalledWith('video-1')
    // User prompt should contain the draft
    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Newsletter draft content'),
      expect.any(Number),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    )
  })

  it('passes debugContext to callGenAI when llmDebugMode enabled', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue({
      ...validPodcast,
      features: { llmDebugMode: true },
    })
    mockGetNewsletterData.mockResolvedValue({ status: 'draft', draft: 'Draft content' })
    mockListNewsByDate.mockResolvedValue(createNewsList(12))
    mockCallGenAI.mockResolvedValue({
      data: { selectedIds: ['news-1', 'news-2', 'news-3'] },
      usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
    })

    await POST(createPostRequest(), createContext('video-1'))

    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Number),
      undefined,
      expect.objectContaining({ component: 'newsletter/news' }),
      undefined,
      undefined,
      undefined
    )
  })

  it('does NOT pass debugContext when llmDebugMode disabled', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue({ status: 'draft', draft: 'Draft content' })
    mockListNewsByDate.mockResolvedValue(createNewsList(12))
    mockCallGenAI.mockResolvedValue({
      data: { selectedIds: ['news-1', 'news-2', 'news-3'] },
      usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
    })

    await POST(createPostRequest(), createContext('video-1'))

    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Number),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    )
  })
})

// --- PATCH Tests ---

describe('PATCH /api/videos/[videoId]/newsletter/news', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSaveNewsletterData.mockResolvedValue(undefined)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await PATCH(
      createPatchRequest({ news: [] }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns 400 when selection has less than 3 items', async () => {
    mockAuthFn.mockResolvedValue(validSession)

    const response = await PATCH(
      createPatchRequest({
        news: [
          { id: 'n1', title: 'News 1' },
          { id: 'n2', title: 'News 2' },
        ],
      }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when selection has more than 5 items', async () => {
    mockAuthFn.mockResolvedValue(validSession)

    const news = Array.from({ length: 6 }, (_, i) => ({
      id: `n${i + 1}`,
      title: `News ${i + 1}`,
    }))

    const response = await PATCH(
      createPatchRequest({ news }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 409 when transition is invalid (status idle)', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue({ status: 'idle' })

    const news = Array.from({ length: 3 }, (_, i) => ({
      id: `n${i + 1}`,
      title: `News ${i + 1}`,
    }))

    const response = await PATCH(
      createPatchRequest({ news }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error.code).toBe('INVALID_TRANSITION')
  })

  it('returns 200 with news_selected status on valid selection', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue({ status: 'draft', draft: 'Some draft' })

    const news = [
      { id: 'n1', title: 'News 1', description: 'Desc', source: 'Fonte', url: 'https://example.com', publishedAt: '2026-02-23' },
      { id: 'n2', title: 'News 2', description: 'Desc', source: 'Fonte', url: 'https://example.com', publishedAt: '2026-02-23' },
      { id: 'n3', title: 'News 3', description: 'Desc', source: 'Fonte', url: 'https://example.com', publishedAt: '2026-02-23' },
    ]

    const response = await PATCH(
      createPatchRequest({ news }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.status).toBe('news_selected')
    expect(mockSaveNewsletterData).toHaveBeenCalledWith('video-1', expect.objectContaining({
      status: 'news_selected',
      news: expect.arrayContaining([
        expect.objectContaining({ id: 'n1' }),
      ]),
    }))
  })

  it('returns 404 when newsletter data does not exist', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue(null)

    const news = Array.from({ length: 3 }, (_, i) => ({
      id: `n${i + 1}`,
      title: `News ${i + 1}`,
    }))

    const response = await PATCH(
      createPatchRequest({ news }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('allows re-selection from news_selected status', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetNewsletterData.mockResolvedValue({
      status: 'news_selected',
      draft: 'Some draft',
      news: [{ id: 'old-1', title: 'Old' }],
    })

    const news = [
      { id: 'n1', title: 'News 1', description: 'Desc', source: 'Fonte', url: 'https://example.com', publishedAt: '2026-02-23' },
      { id: 'n2', title: 'News 2', description: 'Desc', source: 'Fonte', url: 'https://example.com', publishedAt: '2026-02-23' },
      { id: 'n3', title: 'News 3', description: 'Desc', source: 'Fonte', url: 'https://example.com', publishedAt: '2026-02-23' },
    ]

    const response = await PATCH(
      createPatchRequest({ news }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.status).toBe('news_selected')
    expect(mockSaveNewsletterData).toHaveBeenCalledWith('video-1', expect.objectContaining({
      status: 'news_selected',
      news: expect.arrayContaining([expect.objectContaining({ id: 'n1' })]),
    }))
  })
})
