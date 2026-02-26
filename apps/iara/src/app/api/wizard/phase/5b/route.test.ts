import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { POST } from './route'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastAdmin: vi.fn(),
}))

vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: vi.fn(),
  updateVideoAdmin: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast-id',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Mock LLM module — callGenAI is now the sole LLM entry point for Phase 5B
vi.mock('@/lib/llm', async () => {
  const actual = await vi.importActual('@/lib/llm')
  return {
    ...actual,
    callGenAI: vi.fn(),
    createTranscriptionFile: vi.fn().mockResolvedValue('/tmp/test-transcription.txt'),
    cleanupTranscriptionFile: vi.fn().mockResolvedValue(undefined),
  }
})

import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { callGenAI, LLMError } from '@/lib/llm'

const mockAuth = vi.mocked(auth)
const mockGetVideoAdmin = vi.mocked(getVideoAdmin)
const mockUpdateVideoAdmin = vi.mocked(updateVideoAdmin)
const mockGetPodcastAdmin = vi.mocked(getPodcastAdmin)
const mockCallGenAI = vi.mocked(callGenAI)

// Helper to create mock request
function createMockRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/wizard/phase/5b', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/wizard/phase/5b', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    mockUpdateVideoAdmin.mockResolvedValue(undefined)
    mockGetPodcastAdmin.mockResolvedValue(null)
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const request = createMockRequest({ videoId: 'test-video' })
      const response = await POST(request)

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })
  })

  describe('Request validation', () => {
    it('returns 400 for missing videoId', async () => {
      const request = createMockRequest({})
      const response = await POST(request)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for empty videoId', async () => {
      const request = createMockRequest({ videoId: '' })
      const response = await POST(request)

      expect(response.status).toBe(400)
    })
  })

  describe('Video validation', () => {
    it('returns 404 when video not found', async () => {
      mockGetVideoAdmin.mockResolvedValue(null)

      const request = createMockRequest({ videoId: 'non-existent' })
      const response = await POST(request)

      expect(response.status).toBe(404)
      const json = await response.json()
      expect(json.error.code).toBe('NOT_FOUND')
    })

    it('returns 400 when video is not a cut', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        videoType: 'episode',
        transcriptionTXT: 'test',
      } as never)

      const request = createMockRequest({ videoId: 'test-video' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
    })

    it('returns 400 when video is a reel (not cut)', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        videoType: 'reel',
        transcriptionTXT: 'test',
      } as never)

      const request = createMockRequest({ videoId: 'test-video' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
    })

    it('returns 400 when video has no transcription', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        videoType: 'cut',
        transcriptionTXT: undefined,
        transcriptionSRT: undefined,
      } as never)

      const request = createMockRequest({ videoId: 'test-video' })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('MISSING_TRANSCRIPT')
    })
  })

  describe('Success cases', () => {
    beforeEach(() => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'cut-video',
        title: 'Test Cut Video',
        videoType: 'cut',
        transcriptionTXT: 'Test transcription content',
        duration: 180,
        theme: 'Technology',
        guests: [{ name: 'John', role: 'Expert' }],
      } as never)

      mockCallGenAI.mockResolvedValue({
        data: { shortTitles: ['Short 1', 'Short 2', 'Short 3', 'Short 4', 'Short 5'] },
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })
    })

    it('processes cut video successfully', async () => {
      const request = createMockRequest({ videoId: 'cut-video' })
      const response = await POST(request)

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.shortTitles).toHaveLength(5)
      expect(json.usage).toBeDefined()
    })

    it('persists suggestedShortTitles to Firestore', async () => {
      const request = createMockRequest({ videoId: 'cut-video' })
      await POST(request)

      expect(mockUpdateVideoAdmin).toHaveBeenCalledWith(
        'test-podcast-id',
        'cut-video',
        { suggestedShortTitles: ['Short 1', 'Short 2', 'Short 3', 'Short 4', 'Short 5'] }
      )
    })

    it('calls callGenAI with system prompt, user prompt, timeout, and attachment path', async () => {
      const request = createMockRequest({ videoId: 'cut-video' })
      await POST(request)

      expect(mockCallGenAI).toHaveBeenCalledWith(
        expect.stringContaining('títulos curtos'),
        expect.stringContaining('Contexto do Corte'),
        120000,
        '/tmp/test-transcription.txt',
        undefined
      )
    })

    it('accepts additionalContext for revalidation', async () => {
      const request = createMockRequest({
        videoId: 'cut-video',
        additionalContext: 'Focus on the main guest',
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
      // additionalContext is appended to the system prompt
      expect(mockCallGenAI).toHaveBeenCalledWith(
        expect.stringContaining('Focus on the main guest'),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        undefined
      )
    })

    it('uses podcast.prompt.cut.thumbs when configured', async () => {
      mockGetPodcastAdmin.mockResolvedValue({
        prompts: {
          cut: {
            thumbs: {
              description: 'Custom thumb prompt',
              expectedOutput: 'Custom output format',
            },
          },
        },
        personas: {
          writer: {
            role: 'Thumbnail Expert',
            objective: 'Create catchy titles',
            resume: 'Expert in viral content',
          },
        },
      } as never)

      const request = createMockRequest({ videoId: 'cut-video' })
      const response = await POST(request)

      expect(response.status).toBe(200)
      // Verify the configured prompt was used
      expect(mockCallGenAI).toHaveBeenCalledWith(
        expect.stringContaining('Thumbnail Expert'),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
        undefined
      )
    })
  })

  describe('Error handling', () => {
    beforeEach(() => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'cut-video',
        videoType: 'cut',
        transcriptionTXT: 'Test',
      } as never)
    })

    it('returns 500 when LLM returns parse error', async () => {
      mockCallGenAI.mockRejectedValue(
        new LLMError('PARSE_ERROR', 'Erro ao parsear resposta', false)
      )

      const request = createMockRequest({ videoId: 'cut-video' })
      const response = await POST(request)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('PARSE_ERROR')
    })

    it('returns 500 when LLM returns no text', async () => {
      mockCallGenAI.mockRejectedValue(
        new LLMError('INVALID_RESPONSE', 'Nenhum texto na resposta', false)
      )

      const request = createMockRequest({ videoId: 'cut-video' })
      const response = await POST(request)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_RESPONSE')
    })

    it('returns 429 when rate limited', async () => {
      mockCallGenAI.mockRejectedValue(
        new LLMError('RATE_LIMIT', 'Rate limit exceeded', true)
      )

      const request = createMockRequest({ videoId: 'cut-video' })
      const response = await POST(request)

      expect(response.status).toBe(429)
      const json = await response.json()
      expect(json.error.code).toBe('RATE_LIMIT')
      expect(json.error.retryable).toBe(true)
    })

    it('returns 500 when callGenAI returns data without shortTitles', async () => {
      mockCallGenAI.mockResolvedValue({
        data: { notShortTitles: [] } as never,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })

      const request = createMockRequest({ videoId: 'cut-video' })
      const response = await POST(request)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('PARSE_ERROR')
    })
  })
})
