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
const mockCreateTranscriptionFile = vi.fn()
const mockCleanupTranscriptionFile = vi.fn()
vi.mock('@/lib/llm/client', () => ({
  callGenAI: (...args: unknown[]) => mockCallGenAI(...args),
  createTranscriptionFile: (...args: unknown[]) => mockCreateTranscriptionFile(...args),
  cleanupTranscriptionFile: (...args: unknown[]) => mockCleanupTranscriptionFile(...args),
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
  theme: 'Inteligência Artificial',
  videoType: 'episode',
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
        draft: {
          description: 'Crie o corpo da newsletter baseado na transcrição',
          expectedOutput: 'Texto em formato markdown com seções claras',
        },
      },
    },
  },
}

const validLLMResponse = {
  data: {
    draft: '# Newsletter\n\nConteúdo gerado sobre IA...',
  },
  usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
}

// --- Tests ---

describe('POST /api/videos/[videoId]/newsletter/draft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockImplementation((fn: () => Promise<unknown>) => fn())
    mockCreateTranscriptionFile.mockResolvedValue('/tmp/iara-transcription-newsletter-123.txt')
    mockCleanupTranscriptionFile.mockResolvedValue(undefined)
    mockGetNewsletterData.mockResolvedValue(null)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns 404 when video not found', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(null)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('returns 404 when podcast not found', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(null)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('returns INVALID_VIDEO_TYPE for non-episode video', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue({ ...validEpisode, videoType: 'cut' })
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
  })

  it('returns MISSING_PREREQUISITES when title is missing', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue({ ...validEpisode, title: '' })
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_PREREQUISITES')
    expect(json.error.message).toContain('título')
  })

  it('returns MISSING_PREREQUISITES when transcription is missing', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue({ ...validEpisode, transcriptionTXT: undefined })
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_PREREQUISITES')
    expect(json.error.message).toContain('transcrição')
  })

  it('returns MISSING_PREREQUISITES listing all missing fields', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue({
      ...validEpisode,
      title: '',
      description: '',
      transcriptionTXT: undefined,
    })
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_PREREQUISITES')
    expect(json.error.message).toContain('título')
    expect(json.error.message).toContain('descrição')
    expect(json.error.message).toContain('transcrição')
  })

  it('returns MISSING_PROMPT when newsletter draft prompt not configured', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue({
      ...validPodcast,
      prompts: { episode: {} },
    })

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_PROMPT')
  })

  it('generates draft successfully and returns it', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.draft).toBe('# Newsletter\n\nConteúdo gerado sobre IA...')
  })

  it('passes transcription as attachment to callGenAI', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    expect(mockCreateTranscriptionFile).toHaveBeenCalledWith(
      validEpisode.transcriptionTXT,
      0
    )
    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.stringContaining('Redator de newsletters'),
      expect.stringContaining('Episódio sobre IA'),
      60000,
      '/tmp/iara-transcription-newsletter-123.txt',
      undefined,
      undefined,
      undefined
    )
  })

  it('cleans up transcription file after success', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    expect(mockCleanupTranscriptionFile).toHaveBeenCalledWith(
      '/tmp/iara-transcription-newsletter-123.txt'
    )
  })

  it('cleans up transcription file even on LLM error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockRejectedValue(new Error('LLM timeout'))

    await POST(createRequest(), createContext('video-1'))

    expect(mockCleanupTranscriptionFile).toHaveBeenCalledWith(
      '/tmp/iara-transcription-newsletter-123.txt'
    )
  })

  it('persists data via saveNewsletterData with status draft', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    expect(mockSaveNewsletterData).toHaveBeenCalledWith('video-1', {
      status: 'draft',
      draft: '# Newsletter\n\nConteúdo gerado sobre IA...',
    }, undefined)
  })

  it('persists additionalContext when provided', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(
      createRequest({ additionalContext: 'Foque nos highlights técnicos' }),
      createContext('video-1')
    )

    expect(mockSaveNewsletterData).toHaveBeenCalledWith('video-1', {
      status: 'draft',
      draft: '# Newsletter\n\nConteúdo gerado sobre IA...',
      additionalContext: 'Foque nos highlights técnicos',
    }, undefined)

    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.stringContaining('<user-instruction>Foque nos highlights técnicos</user-instruction>'),
      expect.any(String),
      60000,
      expect.any(String),
      undefined,
      undefined,
      undefined
    )
  })

  it('applies invalidation when regenerating from status > draft', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)
    mockGetNewsletterData.mockResolvedValue({
      status: 'news_selected',
      draft: 'old draft',
      news: [{ id: 'n1', title: 'News' }],
    })

    await POST(createRequest(), createContext('video-1'))

    // Should save status + draft with clearFields for downstream invalidation
    expect(mockSaveNewsletterData).toHaveBeenCalledWith(
      'video-1',
      { status: 'draft', draft: '# Newsletter\n\nConteúdo gerado sobre IA...' },
      ['news', 'imagePrompt', 'imageUrl', 'report']
    )
  })

  it('does not persist data on LLM error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockRejectedValue(new Error('LLM error'))

    await POST(createRequest(), createContext('video-1'))

    expect(mockSaveNewsletterData).not.toHaveBeenCalled()
  })

  it('returns INVALID_RESPONSE when LLM returns invalid structure', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue({
      data: { text: 'no draft field' },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    })

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(422)
    expect(json.error.code).toBe('INVALID_RESPONSE')
    expect(mockSaveNewsletterData).not.toHaveBeenCalled()
  })

  it('uses llmQueue.enqueue for sequential processing', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    expect(mockEnqueue).toHaveBeenCalledTimes(1)
  })

  it('returns 429 on LLM RATE_LIMIT error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockRejectedValue(
      new LLMError('RATE_LIMIT', 'Limite de requisições atingido', true)
    )

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(429)
    expect(json.error.code).toBe('RATE_LIMIT')
    expect(mockSaveNewsletterData).not.toHaveBeenCalled()
  })

  it('returns 500 on internal error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockRejectedValue(new Error('Firestore error'))

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })

  it('logs warning when writer persona is not configured', async () => {
    const { log } = await import('@/lib/logger')
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue({
      ...validPodcast,
      personas: {},
    })
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

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
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      60000,
      expect.any(String), // attachment path
      expect.objectContaining({ component: 'newsletter/draft' }),
      undefined,
      undefined
    )
  })

  it('does NOT pass debugContext when llmDebugMode disabled', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveNewsletterData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      60000,
      expect.any(String),
      undefined,
      undefined,
      undefined
    )
  })
})
