import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Session } from 'next-auth'

// --- Hoisted mock factories ---
const mockAuthFn = vi.fn<() => Promise<Session | null>>()
const mockGetVideoAdmin = vi.fn()
const mockGetPodcastAdmin = vi.fn()
const mockSaveSocialPostFromLLM = vi.fn()
const mockCallGenAI = vi.fn()
const mockCreateTranscriptionFile = vi.fn()
const mockCleanupTranscriptionFile = vi.fn()
const mockLlmQueueEnqueue = vi.fn((fn: () => Promise<unknown>) => fn())

vi.mock('@/lib/auth', () => ({
  auth: () => mockAuthFn(),
}))

vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: (...args: unknown[]) => mockGetVideoAdmin(...args),
}))

vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastAdmin: (...args: unknown[]) => mockGetPodcastAdmin(...args),
}))

vi.mock('@/lib/firebase/social-admin', () => ({
  saveSocialPostFromLLM: (...args: unknown[]) => mockSaveSocialPostFromLLM(...args),
}))

vi.mock('@/lib/llm/client', () => ({
  callGenAI: (...args: unknown[]) => mockCallGenAI(...args),
  createTranscriptionFile: (...args: unknown[]) => mockCreateTranscriptionFile(...args),
  cleanupTranscriptionFile: (...args: unknown[]) => mockCleanupTranscriptionFile(...args),
}))

vi.mock('@/lib/llm/queue', () => ({
  llmQueue: {
    enqueue: (fn: () => Promise<unknown>) => mockLlmQueueEnqueue(fn),
  },
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { log } from '@/lib/logger'

import { POST } from './route'

// --- Helpers ---
const validSession = {
  user: { id: 'user-1', name: 'Test', email: 'test@test.com', role: 'admin' },
  expires: new Date(Date.now() + 86400000).toISOString(),
} as Session

const mockTimestamp = { toDate: () => new Date(), toMillis: () => Date.now(), seconds: 1700000000, nanoseconds: 0 }

function createContext(videoId: string, networkId: string) {
  return { params: Promise.resolve({ videoId, networkId }) }
}

function createRequest(body?: unknown): NextRequest {
  if (body === undefined) {
    return new NextRequest('http://localhost/api/videos/v1/social-posts/instagram/generate', {
      method: 'POST',
    })
  }
  return new NextRequest('http://localhost/api/videos/v1/social-posts/instagram/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const baseVideo = {
  id: 'video-1',
  title: 'Episode about AI',
  description: 'A deep dive into artificial intelligence',
  duration: 3600,
  publishedAt: mockTimestamp,
  videoType: 'episode',
  theme: 'Artificial Intelligence',
  transcriptionTXT: 'Full transcript text...',
}

const basePodcast = {
  id: 'pptnc',
  name: 'PPT Não Compila',
  channelId: 'ch-1',
  ownerId: 'owner-1',
  personas: {
    critic: { role: '', objective: '', resume: '' },
    writer: { role: '', objective: '', resume: '' },
    socialmedia: {
      role: 'Gerente de Mídia',
      objective: 'Criar posts engajadores',
      resume: 'XP social media',
    },
  },
  prompts: {
    episode: {
      critique: { description: '', expectedOutput: '' },
      editing: { description: '', expectedOutput: '' },
      compliance: { description: '', expectedOutput: '' },
      chapters: { description: '', expectedOutput: '' },
      titles: { description: '', expectedOutput: '' },
      description: { description: '', expectedOutput: '' },
      tags: { description: '', expectedOutput: '' },
      social: {
        instagram: {
          description: 'Crie um post para Instagram',
          expectedOutput: 'Post com hashtags',
        },
      },
    },
    cut: {
      titles: { description: '', expectedOutput: '' },
      thumbs: { description: '', expectedOutput: '' },
      description: { description: '', expectedOutput: '' },
      tags: { description: '', expectedOutput: '' },
      social: {
        instagram: {
          description: 'Crie um post para Instagram (cut)',
          expectedOutput: 'Post curto',
        },
      },
    },
    reel: {
      titles: { description: '', expectedOutput: '' },
      description: { description: '', expectedOutput: '' },
      tags: { description: '', expectedOutput: '' },
      social: {
        instagram: {
          description: 'Crie um post para Instagram (reel)',
          expectedOutput: 'Post reel curto',
        },
      },
    },
  },
  videoTypes: {
    episode: { minDuration: 1200, maxDuration: null },
    cut: { minDuration: 180, maxDuration: 1199 },
    reel: { minDuration: 0, maxDuration: 179 },
  },
  features: { editorial: true, news: true, includeLivestreams: false, socialMedia: true },
  createdAt: mockTimestamp,
  updatedAt: mockTimestamp,
}

const llmResponse = {
  data: {
    cta: 'Assista agora!',
    body: 'Novo episódio sobre IA',
    hashtags: ['#ai', '#podcast', '#tech'],
  },
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
}

describe('POST /api/videos/[videoId]/social-posts/[networkId]/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFn.mockResolvedValue(validSession)
    mockGetVideoAdmin.mockResolvedValue(baseVideo)
    mockGetPodcastAdmin.mockResolvedValue(basePodcast)
    mockCallGenAI.mockResolvedValue(llmResponse)
    mockSaveSocialPostFromLLM.mockResolvedValue(undefined)
    mockCreateTranscriptionFile.mockResolvedValue('/tmp/mock-transcription.txt')
    mockCleanupTranscriptionFile.mockResolvedValue(undefined)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuthFn.mockResolvedValue(null)

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error.code).toBe('AUTH_EXPIRED')
  })

  it('returns 400 when video is missing prerequisites', async () => {
    mockGetVideoAdmin.mockResolvedValue({
      ...baseVideo,
      title: '',
      theme: undefined,
      description: undefined,
    })

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_PREREQUISITES')
  })

  it('returns 400 when prompt is not configured for networkId', async () => {
    const response = await POST(createRequest(), createContext('video-1', 'tiktok'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('MISSING_PROMPT')
    expect(json.error.message).toContain('tiktok')
  })

  it('returns 200 for successful episode generation without transcription attachment', async () => {
    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.networkId).toBe('instagram')
    expect(json.data.cta).toBe('Assista agora!')
    expect(json.data.body).toBe('Novo episódio sobre IA')
    expect(json.data.hashtags).toEqual(['#ai', '#podcast', '#tech'])
    expect(json.data.processedBy).toBe('llm')

    // Episode should NOT create transcription file
    expect(mockCreateTranscriptionFile).not.toHaveBeenCalled()

    // callGenAI should be called with undefined attachmentPath and debugContext
    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      60000,
      undefined,
      undefined,
      undefined,
      undefined
    )

    expect(mockSaveSocialPostFromLLM).toHaveBeenCalledWith(
      'video-1',
      'instagram',
      { cta: 'Assista agora!', body: 'Novo episódio sobre IA', hashtags: ['#ai', '#podcast', '#tech'] },
      undefined
    )
  })

  it('returns 200 for cut with transcription attachment', async () => {
    const cutVideo = {
      ...baseVideo,
      videoType: 'cut',
      duration: 300,
      parentEpisodeId: 'parent-ep',
      transcriptionTXT: 'Short cut transcript',
    }
    mockGetVideoAdmin
      .mockResolvedValueOnce(cutVideo) // first call: the cut video
      .mockResolvedValueOnce({ ...baseVideo, id: 'parent-ep' }) // second call: parent

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.processedBy).toBe('llm')

    // Cut should create and cleanup transcription file
    expect(mockCreateTranscriptionFile).toHaveBeenCalledWith('Short cut transcript', 0)
    expect(mockCleanupTranscriptionFile).toHaveBeenCalledWith('/tmp/mock-transcription.txt')

    // callGenAI should be called with attachment path and debugContext
    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      60000,
      '/tmp/mock-transcription.txt',
      undefined,
      undefined,
      undefined
    )
  })

  it('includes additionalContext in prompt and persistence', async () => {
    const response = await POST(
      createRequest({ additionalContext: 'Foque em humor' }),
      createContext('video-1', 'instagram')
    )
    const json = await response.json()

    expect(response.status).toBe(200)

    // Verify additionalContext reaches system prompt
    const systemPromptArg = mockCallGenAI.mock.calls[0][0] as string
    expect(systemPromptArg).toContain('Foque em humor')

    // Verify additionalContext is persisted
    expect(mockSaveSocialPostFromLLM).toHaveBeenCalledWith(
      'video-1',
      'instagram',
      expect.any(Object),
      'Foque em humor'
    )
  })

  it('returns 429 on LLM rate limit error', async () => {
    const { LLMError } = await import('@/lib/llm/errors')
    mockCallGenAI.mockRejectedValue(new LLMError('RATE_LIMIT', 'Rate limit exceeded', true))

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(429)
    expect(json.error.code).toBe('RATE_LIMIT')
  })

  it('returns 500 on LLM parse error', async () => {
    const { LLMError } = await import('@/lib/llm/errors')
    mockCallGenAI.mockRejectedValue(new LLMError('PARSE_ERROR', 'Failed to parse', false))

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('PARSE_ERROR')
  })

  it('returns 500 on generic error', async () => {
    mockCallGenAI.mockRejectedValue(new Error('Unexpected failure'))

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INTERNAL_ERROR')
  })

  it('accepts empty body (no additionalContext)', async () => {
    const response = await POST(createRequest(), createContext('video-1', 'instagram'))

    expect(response.status).toBe(200)
  })

  it('returns 404 when video not found', async () => {
    mockGetVideoAdmin.mockResolvedValue(null)

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('returns 404 when podcast not found', async () => {
    mockGetPodcastAdmin.mockResolvedValue(null)

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error.code).toBe('NOT_FOUND')
  })

  it('uses llmQueue.enqueue for sequential processing', async () => {
    await POST(createRequest(), createContext('video-1', 'instagram'))

    expect(mockLlmQueueEnqueue).toHaveBeenCalledWith(expect.any(Function))
  })

  it('returns 200 for reel with transcription attachment', async () => {
    const reelVideo = {
      ...baseVideo,
      videoType: 'reel',
      duration: 60,
      parentEpisodeId: 'parent-ep',
      transcriptionTXT: 'Short reel transcript',
    }
    mockGetVideoAdmin
      .mockResolvedValueOnce(reelVideo)
      .mockResolvedValueOnce({ ...baseVideo, id: 'parent-ep' })

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.processedBy).toBe('llm')

    // Reel should create and cleanup transcription file
    expect(mockCreateTranscriptionFile).toHaveBeenCalledWith('Short reel transcript', 0)
    expect(mockCleanupTranscriptionFile).toHaveBeenCalledWith('/tmp/mock-transcription.txt')

    // callGenAI should be called with attachment path and debugContext
    expect(mockCallGenAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      60000,
      '/tmp/mock-transcription.txt',
      undefined,
      undefined,
      undefined
    )
  })

  it('cleans up transcription file even when LLM fails for cut', async () => {
    const { LLMError } = await import('@/lib/llm/errors')
    const cutVideo = {
      ...baseVideo,
      videoType: 'cut',
      duration: 300,
      parentEpisodeId: 'parent-ep',
      transcriptionTXT: 'Short cut transcript',
    }
    mockGetVideoAdmin
      .mockResolvedValueOnce(cutVideo)
      .mockResolvedValueOnce({ ...baseVideo, id: 'parent-ep' })
    mockCallGenAI.mockRejectedValue(new LLMError('RATE_LIMIT', 'Rate limit', true))

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))

    expect(response.status).toBe(429)

    // Transcription file should still be cleaned up via finally block
    expect(mockCreateTranscriptionFile).toHaveBeenCalledWith('Short cut transcript', 0)
    expect(mockCleanupTranscriptionFile).toHaveBeenCalledWith('/tmp/mock-transcription.txt')
  })

  it('returns 200 with WARN log when socialmedia persona is undefined', async () => {
    const podcastWithoutPersona = {
      ...basePodcast,
      personas: {
        critic: { role: '', objective: '', resume: '' },
        writer: { role: '', objective: '', resume: '' },
      },
    }
    mockGetPodcastAdmin.mockResolvedValue(podcastWithoutPersona)

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.processedBy).toBe('llm')

    // Should log WARN about missing persona
    expect(log).toHaveBeenCalledWith(
      'WARN',
      'socialmedia persona not configured, using empty fallback',
      expect.objectContaining({ videoId: 'video-1', networkId: 'instagram' })
    )
  })

  it('returns 500 when LLM returns valid JSON but invalid schema (ZodError)', async () => {
    mockCallGenAI.mockResolvedValue({
      data: {
        cta: 'Valid CTA',
        body: 'Valid body',
        hashtags: 'not-an-array', // should be string[]
      },
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error.code).toBe('INVALID_RESPONSE')
    expect(mockSaveSocialPostFromLLM).not.toHaveBeenCalled()
  })

  it('returns 400 when additionalContext exceeds max length', async () => {
    const longContext = 'a'.repeat(501)
    const response = await POST(
      createRequest({ additionalContext: longContext }),
      createContext('video-1', 'instagram')
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION_ERROR')
    expect(mockCallGenAI).not.toHaveBeenCalled()
  })

  it('returns 200 for cut without parentEpisodeId (skips parent fetch)', async () => {
    const cutVideo = {
      ...baseVideo,
      videoType: 'cut',
      duration: 300,
      transcriptionTXT: 'Short cut transcript',
      // No parentEpisodeId
    }
    mockGetVideoAdmin.mockResolvedValue(cutVideo)

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.processedBy).toBe('llm')

    // Should only call getVideoAdmin once (no parent fetch)
    expect(mockGetVideoAdmin).toHaveBeenCalledTimes(1)

    // User prompt should NOT contain parent section
    const userPromptArg = mockCallGenAI.mock.calls[0][1] as string
    expect(userPromptArg).not.toContain('derivado (corte)')
  })

  it('returns 200 for cut when parent video is not found', async () => {
    const cutVideo = {
      ...baseVideo,
      videoType: 'cut',
      duration: 300,
      parentEpisodeId: 'deleted-parent',
      transcriptionTXT: 'Short cut transcript',
    }
    mockGetVideoAdmin
      .mockResolvedValueOnce(cutVideo)
      .mockResolvedValueOnce(null) // parent not found

    const response = await POST(createRequest(), createContext('video-1', 'instagram'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data.processedBy).toBe('llm')

    // Should still create transcription file (cut with transcription)
    expect(mockCreateTranscriptionFile).toHaveBeenCalledWith('Short cut transcript', 0)

    // User prompt should NOT contain parent section
    const userPromptArg = mockCallGenAI.mock.calls[0][1] as string
    expect(userPromptArg).not.toContain('derivado (corte)')
  })
})
