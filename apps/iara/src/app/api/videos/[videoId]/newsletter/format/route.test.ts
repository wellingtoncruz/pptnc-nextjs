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

import { POST } from './route'

// --- Fixtures ---

const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

function createContext(videoId: string) {
  return { params: Promise.resolve({ videoId }) }
}

function createRequest(body?: Record<string, unknown>) {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
}

const validEpisode = {
  id: 'video-1',
  title: 'Episódio sobre IA',
  description: 'Discussão sobre IA generativa',
  videoType: 'episode',
}

const validPodcast = {
  id: 'pptnc',
  personas: {
    writer: {
      role: 'Redator de newsletters',
      objective: 'Criar newsletters engajantes',
      resume: '10 anos de experiência',
    },
  },
  prompts: {
    episode: {
      newsletter: {
        format: {
          description: 'Formate a newsletter final',
          expectedOutput: 'Newsletter formatada em markdown',
        },
      },
    },
  },
}

const validNewsletterData = {
  status: 'image_ready',
  draft: '# Newsletter\n\nConteúdo do draft...',
  news: [
    { id: 'n1', title: 'Notícia 1', source: 'Fonte A' },
    { id: 'n2', title: 'Notícia 2' },
  ],
  imagePrompt: 'prompt para imagem',
  imageUrl: 'newsletters/video-1/cover.png',
}

const validLLMResponse = {
  data: {
    report: '# Relatório Final\n\nConteúdo formatado da newsletter...',
  },
  usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
}

// --- Tests ---

describe('POST /api/videos/[videoId]/newsletter/format', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockImplementation((fn: () => Promise<unknown>) => fn())
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns 400 when formatPrompt is missing', async () => {
    mockAuthFn.mockResolvedValue(validSession)

    const response = await POST(createRequest({}), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('INVALID_BODY')
  })

  it('returns 404 when video not found', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(null)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('returns 404 when podcast not found', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(null)

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('returns INVALID_VIDEO_TYPE for cut video', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue({ ...validEpisode, videoType: 'cut' })
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
  })

  it('returns MISSING_NEWSLETTER when no newsletter data', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue(null)

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_NEWSLETTER')
  })

  it('returns INVALID_STATUS when newsletter status is draft', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue({ ...validNewsletterData, status: 'draft' })

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('INVALID_STATUS')
  })

  it('returns INVALID_STATUS when newsletter status is news_selected', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue({ ...validNewsletterData, status: 'news_selected' })

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('INVALID_STATUS')
  })

  it('returns MISSING_DRAFT when draft is missing', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue({ ...validNewsletterData, draft: undefined })

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_DRAFT')
  })

  it('returns MISSING_IMAGE when imageUrl is missing', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue({ ...validNewsletterData, imageUrl: undefined })

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_IMAGE')
  })

  it('generates report successfully with status image_ready', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue(validNewsletterData)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    const response = await POST(
      createRequest({ formatPrompt: 'Formate a newsletter' }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.report).toBe('# Relatório Final\n\nConteúdo formatado da newsletter...')
  })

  it('generates report successfully with status completed (regeneration)', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue({ ...validNewsletterData, status: 'completed', report: 'old report' })
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    const response = await POST(
      createRequest({ formatPrompt: 'Novo prompt' }),
      createContext('video-1')
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.report).toBe('# Relatório Final\n\nConteúdo formatado da newsletter...')
  })

  it('saves report and status completed to Firestore (without formatPrompt)', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue(validNewsletterData)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(
      createRequest({ formatPrompt: 'Formate a newsletter final' }),
      createContext('video-1')
    )

    const savedData = mockSaveNewsletterData.mock.calls[0][1]
    expect(savedData.status).toBe('completed')
    expect(savedData.report).toBe('# Relatório Final\n\nConteúdo formatado da newsletter...')
    expect(savedData.draft).toBe(validNewsletterData.draft)
    expect(savedData.imageUrl).toBe(validNewsletterData.imageUrl)
    // formatPrompt should NOT be persisted — it always comes from settings
    expect(savedData).not.toHaveProperty('formatPrompt')
  })

  it('uses llmQueue.enqueue for sequential processing', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue(validNewsletterData)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))

    expect(mockEnqueue).toHaveBeenCalledTimes(1)
  })

  it('passes no attachment to callGenAI', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue(validNewsletterData)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))

    // callGenAI: (systemPrompt, userPrompt, timeout, attachmentPath, debugContext)
    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      60000,
      undefined,
      undefined
    )
  })

  it('returns 429 on LLM RATE_LIMIT error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue(validNewsletterData)
    mockCallGenAI.mockRejectedValue(
      new LLMError('RATE_LIMIT', 'Limite de requisições atingido', true)
    )

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(429)
    expect(json.error.code).toBe('RATE_LIMIT')
    expect(mockSaveNewsletterData).not.toHaveBeenCalled()
  })

  it('returns INVALID_RESPONSE when LLM returns invalid structure', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue(validNewsletterData)
    mockCallGenAI.mockResolvedValue({
      data: { wrongField: 'no report field' },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    })

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(422)
    expect(json.error.code).toBe('INVALID_RESPONSE')
    expect(mockSaveNewsletterData).not.toHaveBeenCalled()
  })

  it('returns 500 on internal error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockRejectedValue(new Error('Firestore error'))

    const response = await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })

  it('logs warning when persona is not configured', async () => {
    const { log } = await import('@/lib/logger')
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue({
      ...validPodcast,
      personas: {},
    })
    mockGetNewsletterData.mockResolvedValue(validNewsletterData)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))

    expect(log).toHaveBeenCalledWith(
      'WARN',
      expect.stringContaining('persona'),
      expect.objectContaining({ videoId: 'video-1' })
    )
  })

  it('passes debugContext to callGenAI when llmDebugMode enabled', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue({
      ...validPodcast,
      features: { llmDebugMode: true },
    })
    mockGetNewsletterData.mockResolvedValue(validNewsletterData)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))

    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      60000,
      undefined,
      expect.objectContaining({ component: 'newsletter/format' })
    )
  })

  it('does NOT pass debugContext when llmDebugMode disabled', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockGetNewsletterData.mockResolvedValue(validNewsletterData)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest({ formatPrompt: 'test' }), createContext('video-1'))

    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      60000,
      undefined,
      undefined
    )
  })
})
