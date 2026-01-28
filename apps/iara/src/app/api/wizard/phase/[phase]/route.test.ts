import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { POST } from './route'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: vi.fn(),
}))

vi.mock('@/lib/llm', () => ({
  callLLM: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import mocked modules
import { auth } from '@/lib/auth'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { callLLM } from '@/lib/llm'

const mockSession = { user: { id: 'user-123', email: 'test@example.com' } }

const mockVideo = {
  id: 'video-123',
  title: 'Test Video',
  description: 'Test description',
  duration: 3600,
  // Mock Firestore Timestamp
  publishedAt: {
    toDate: () => new Date(),
    toMillis: () => Date.now(),
    seconds: Math.floor(Date.now() / 1000),
    nanoseconds: 0,
  },
  theme: 'Test theme',
  guests: [{ name: 'Guest', role: 'CEO', company: 'Company', linkedin: 'https://linkedin.com/in/guest' }],
  transcriptionSRT: 'Test transcript',
}

const mockPhase1Response = {
  critique: 'Great episode!',
  highlights: ['Good intro', 'Clear explanations'],
  suggestions: ['Add more examples'],
}

function createRequest(phase: string, body: object): NextRequest {
  return new NextRequest(`http://localhost:3000/api/wizard/phase/${phase}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/wizard/phase/[phase]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(mockSession as ReturnType<typeof auth>)
    vi.mocked(getVideoAdmin).mockResolvedValue(mockVideo as Awaited<ReturnType<typeof getVideoAdmin>>)
    vi.mocked(callLLM).mockResolvedValue({
      success: true,
      data: mockPhase1Response,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })
  })

  describe('Authentication', () => {
    it('returns 401 if session is not authenticated', async () => {
      vi.mocked(auth).mockResolvedValue(null)

      const request = createRequest('1', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: '1' }) })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error.code).toBe('AUTH_EXPIRED')
    })
  })

  describe('Validation', () => {
    it('returns 400 for invalid phase number', async () => {
      const request = createRequest('9', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: '9' }) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error.code).toBe('VALIDATION_ERROR')
      expect(data.error.message).toContain('Fase inválida')
    })

    it('returns 400 for phase 8 (no LLM)', async () => {
      const request = createRequest('8', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: '8' }) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error.code).toBe('VALIDATION_ERROR')
      expect(data.error.message).toContain('Fase 8 não usa LLM')
    })

    it('returns 400 for missing videoId', async () => {
      const request = createRequest('1', {})
      const response = await POST(request, { params: Promise.resolve({ phase: '1' }) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 404 if video not found', async () => {
      vi.mocked(getVideoAdmin).mockResolvedValue(null)

      const request = createRequest('1', { videoId: 'not-found' })
      const response = await POST(request, { params: Promise.resolve({ phase: '1' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error.code).toBe('NOT_FOUND')
    })
  })

  describe('LLM Processing', () => {
    it('calls callLLM with correct parameters for phase 1', async () => {
      const request = createRequest('1', { videoId: 'video-123' })
      await POST(request, { params: Promise.resolve({ phase: '1' }) })

      expect(callLLM).toHaveBeenCalledWith(
        1,
        mockVideo,
        undefined,
        {
          promptOverride: undefined,
          additionalContext: undefined,
          previousPhaseData: undefined,
        }
      )
    })

    it('passes promptOverride to callLLM', async () => {
      const request = createRequest('5', {
        videoId: 'video-123',
        promptOverride: 'Custom prompt',
      })
      await POST(request, { params: Promise.resolve({ phase: '5' }) })

      expect(callLLM).toHaveBeenCalledWith(
        5,
        mockVideo,
        undefined,
        expect.objectContaining({
          promptOverride: 'Custom prompt',
        })
      )
    })

    it('passes additionalContext to callLLM', async () => {
      const request = createRequest('5', {
        videoId: 'video-123',
        additionalContext: 'Extra context',
      })
      await POST(request, { params: Promise.resolve({ phase: '5' }) })

      expect(callLLM).toHaveBeenCalledWith(
        5,
        mockVideo,
        undefined,
        expect.objectContaining({
          additionalContext: 'Extra context',
        })
      )
    })

  })

  describe('Success Response', () => {
    it('returns phase data on success', async () => {
      const request = createRequest('1', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: '1' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toEqual(mockPhase1Response)
    })

    it('returns usage information on success', async () => {
      const request = createRequest('1', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: '1' }) })
      const data = await response.json()

      expect(data.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      })
    })
  })

  describe('Error Handling', () => {
    it('returns LLM error with correct status code', async () => {
      vi.mocked(callLLM).mockResolvedValue({
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
          retryable: true,
        },
      })

      const request = createRequest('1', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: '1' }) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error.code).toBe('TIMEOUT')
      expect(data.error.retryable).toBe(true)
    })

    it('returns 429 for rate limit errors', async () => {
      vi.mocked(callLLM).mockResolvedValue({
        success: false,
        error: {
          code: 'RATE_LIMIT',
          message: 'Rate limit exceeded',
          retryable: true,
        },
      })

      const request = createRequest('1', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: '1' }) })

      expect(response.status).toBe(429)
    })

    it('returns 500 for unexpected errors', async () => {
      vi.mocked(callLLM).mockRejectedValue(new Error('Unexpected error'))

      const request = createRequest('1', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: '1' }) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('All valid phases', () => {
    it.each([1, 2, 3, 4, 5, 6, 7])('processes phase %i successfully', async (phase) => {
      const request = createRequest(String(phase), { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: String(phase) }) })

      expect(response.status).toBe(200)
      expect(callLLM).toHaveBeenCalledWith(
        phase,
        expect.anything(),
        undefined,
        expect.anything()
      )
    })
  })
})
