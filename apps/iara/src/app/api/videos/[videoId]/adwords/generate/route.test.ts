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

const mockSaveAdwordsData = vi.fn()
vi.mock('@/lib/firebase/adwords-admin', () => ({
  saveAdwordsData: (...args: unknown[]) => mockSaveAdwordsData(...args),
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
    adwords: {
      role: 'Especialista em Google Ads',
      objective: 'Otimizar tráfego pago',
      resume: '15 anos de experiência',
    },
  },
  prompts: {
    episode: {
      adwords: {
        description: 'Crie um guia de otimização AdWords',
        expectedOutput: 'Guia detalhado com keywords',
      },
    },
  },
}

const validLLMResponse = {
  data: {
    guide: '# Guia de Tráfego Pago\n\nEstratégias para o episódio...',
    keywords: ['ia generativa', 'podcast tech', 'inteligência artificial'],
  },
  usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
}

// --- Tests ---

describe('POST /api/videos/[videoId]/adwords/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnqueue.mockImplementation((fn: () => Promise<unknown>) => fn())
    mockCreateTranscriptionFile.mockResolvedValue('/tmp/iara-transcription-adwords-123.txt')
    mockCleanupTranscriptionFile.mockResolvedValue(undefined)
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

  it('returns INVALID_VIDEO_TYPE for cut video', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue({ ...validEpisode, videoType: 'cut' })
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
  })

  it('returns INVALID_VIDEO_TYPE for reel video', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue({ ...validEpisode, videoType: 'reel' })
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

  it('returns MISSING_PREREQUISITES when description is missing', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue({ ...validEpisode, description: '' })
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_PREREQUISITES')
    expect(json.error.message).toContain('descrição')
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

  it('returns MISSING_PROMPT when adwords prompt not configured', async () => {
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

  it('returns MISSING_PROMPT when episode prompts not configured at all', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue({
      ...validPodcast,
      prompts: {},
    })

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_PROMPT')
  })

  it('generates adwords successfully and returns guide + keywords', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveAdwordsData.mockResolvedValue(undefined)

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.guide).toBe('# Guia de Tráfego Pago\n\nEstratégias para o episódio...')
    expect(json.data.keywords).toEqual(['ia generativa', 'podcast tech', 'inteligência artificial'])
    expect(json.data).toHaveProperty('generatedAt')
  })

  it('passes correct arguments to callGenAI with transcription attachment', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveAdwordsData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    // Verify transcription file was created
    expect(mockCreateTranscriptionFile).toHaveBeenCalledWith(
      validEpisode.transcriptionTXT,
      0
    )

    // Verify callGenAI received the attachment path and debugContext
    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.stringContaining('Especialista em Google Ads'),
      expect.stringContaining('Episódio sobre IA'),
      60000,
      '/tmp/iara-transcription-adwords-123.txt',
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
    mockSaveAdwordsData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    expect(mockCleanupTranscriptionFile).toHaveBeenCalledWith(
      '/tmp/iara-transcription-adwords-123.txt'
    )
  })

  it('cleans up transcription file even on LLM error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockRejectedValue(new Error('LLM timeout'))
    mockSaveAdwordsData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    expect(mockCleanupTranscriptionFile).toHaveBeenCalledWith(
      '/tmp/iara-transcription-adwords-123.txt'
    )
  })

  it('persists data via saveAdwordsData on success', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveAdwordsData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    expect(mockSaveAdwordsData).toHaveBeenCalledWith('video-1', {
      guide: '# Guia de Tráfego Pago\n\nEstratégias para o episódio...',
      keywords: ['ia generativa', 'podcast tech', 'inteligência artificial'],
    })
  })

  it('persists additionalContext when provided', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveAdwordsData.mockResolvedValue(undefined)

    await POST(
      createRequest({ additionalContext: 'Foque em remarketing' }),
      createContext('video-1')
    )

    expect(mockSaveAdwordsData).toHaveBeenCalledWith('video-1', {
      guide: '# Guia de Tráfego Pago\n\nEstratégias para o episódio...',
      keywords: ['ia generativa', 'podcast tech', 'inteligência artificial'],
      additionalContext: 'Foque em remarketing',
    })

    // Verify additionalContext is forwarded to the LLM system prompt
    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.stringContaining('Dê uma atenção especial a essa instrução: Foque em remarketing'),
      expect.any(String),
      60000,
      expect.any(String),
      undefined,
      undefined,
      undefined
    )
  })

  it('does not persist data on LLM error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockRejectedValue(new Error('LLM error'))

    await POST(createRequest(), createContext('video-1'))

    expect(mockSaveAdwordsData).not.toHaveBeenCalled()
  })

  it('returns INVALID_RESPONSE when LLM returns invalid structure', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue({
      data: { guide: 'only guide, no keywords' },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    })

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INVALID_RESPONSE')
    expect(mockSaveAdwordsData).not.toHaveBeenCalled()
  })

  it('uses llmQueue.enqueue for sequential processing', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue(validPodcast)
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveAdwordsData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    expect(mockEnqueue).toHaveBeenCalledTimes(1)
  })

  it('logs warning when persona is not configured', async () => {
    const { log } = await import('@/lib/logger')
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(validEpisode)
    mockGetPodcastAdmin.mockResolvedValue({
      ...validPodcast,
      personas: {},
    })
    mockCallGenAI.mockResolvedValue(validLLMResponse)
    mockSaveAdwordsData.mockResolvedValue(undefined)

    await POST(createRequest(), createContext('video-1'))

    expect(log).toHaveBeenCalledWith(
      'WARN',
      expect.stringContaining('persona'),
      expect.objectContaining({ videoId: 'video-1' })
    )
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
    expect(mockSaveAdwordsData).not.toHaveBeenCalled()
  })

  it('returns 500 on internal error', async () => {
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockRejectedValue(new Error('Firestore error'))

    const response = await POST(createRequest(), createContext('video-1'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })
})
