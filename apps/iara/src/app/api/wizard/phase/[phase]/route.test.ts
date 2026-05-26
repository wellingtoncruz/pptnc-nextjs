import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { POST } from './route'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: vi.fn(),
  updateVideoAdmin: vi.fn().mockResolvedValue(undefined),
}))

import { updateVideoAdmin } from '@/lib/firebase/videos-admin'

vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastAdmin: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/llm', () => ({
  callLLMQueued: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import mocked modules
import { auth } from '@/lib/auth'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { callLLMQueued } from '@/lib/llm'

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

const mockPhase2Response = {
  hasIssues: true,
  issues: [{ timestamp: '00:05:30', description: 'Corte abrupto' }],
}

const mockPhase3Response = {
  hasRisks: true,
  risks: [{ timestamp: '00:12:45', risk: 'brand_mention', description: 'Menção de marca XYZ' }],
}

const mockPhase4Response = {
  chapters: [
    { timestamp: '00:00', title: 'Introdução' },
    { timestamp: '05:30', title: 'Tema Principal' },
    { timestamp: '15:00', title: 'Conclusão' },
  ],
}

// Generic mock responses per phase for the "all phases" test
const mockPhaseResponses: Record<string, object> = {
  critique: mockPhase1Response,
  'edit-check': mockPhase2Response,
  risk: mockPhase3Response,
  chapters: mockPhase4Response,
  title: { titles: ['Title 1', 'Title 2', 'Title 3', 'Title 4', 'Title 5'] },
  description: { description: 'Video description' },
  tags: { tags: ['tag1', 'tag2'] },
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
    vi.mocked(callLLMQueued).mockResolvedValue({
      success: true,
      data: mockPhase1Response,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })
  })

  describe('Authentication', () => {
    it('returns 401 if session is not authenticated', async () => {
      vi.mocked(auth).mockResolvedValue(null)

      const request = createRequest('critique', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: 'critique' }) })
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

    it('returns 400 for publish (no LLM)', async () => {
      const request = createRequest('publish', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: 'publish' }) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error.code).toBe('VALIDATION_ERROR')
      expect(data.error.message).toContain('Fase inválida')
    })

    it('returns 400 for missing videoId', async () => {
      const request = createRequest('critique', {})
      const response = await POST(request, { params: Promise.resolve({ phase: 'critique' }) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 404 if video not found', async () => {
      vi.mocked(getVideoAdmin).mockResolvedValue(null)

      const request = createRequest('critique', { videoId: 'not-found' })
      const response = await POST(request, { params: Promise.resolve({ phase: 'critique' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error.code).toBe('NOT_FOUND')
    })
  })

  describe('LLM Processing', () => {
    it('calls callLLM with correct parameters for phase 1', async () => {
      const request = createRequest('critique', { videoId: 'video-123' })
      await POST(request, { params: Promise.resolve({ phase: 'critique' }) })

      expect(callLLMQueued).toHaveBeenCalledWith(
        'critique',
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
      const request = createRequest('title', {
        videoId: 'video-123',
        promptOverride: 'Custom prompt',
      })
      await POST(request, { params: Promise.resolve({ phase: 'title' }) })

      expect(callLLMQueued).toHaveBeenCalledWith(
        'title',
        mockVideo,
        undefined,
        expect.objectContaining({
          promptOverride: 'Custom prompt',
        })
      )
    })

    it('passes additionalContext to callLLM', async () => {
      const request = createRequest('title', {
        videoId: 'video-123',
        additionalContext: 'Extra context',
      })
      await POST(request, { params: Promise.resolve({ phase: 'title' }) })

      expect(callLLMQueued).toHaveBeenCalledWith(
        'title',
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
      const request = createRequest('critique', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: 'critique' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toEqual(mockPhase1Response)
    })

    it('returns usage information on success', async () => {
      const request = createRequest('critique', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: 'critique' }) })
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
      vi.mocked(callLLMQueued).mockResolvedValue({
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
          retryable: true,
        },
      })

      const request = createRequest('critique', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: 'critique' }) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error.code).toBe('TIMEOUT')
      expect(data.error.retryable).toBe(true)
    })

    it('returns 429 for rate limit errors', async () => {
      vi.mocked(callLLMQueued).mockResolvedValue({
        success: false,
        error: {
          code: 'RATE_LIMIT',
          message: 'Rate limit exceeded',
          retryable: true,
        },
      })

      const request = createRequest('critique', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: 'critique' }) })

      expect(response.status).toBe(429)
    })

    it('returns 500 for unexpected errors', async () => {
      vi.mocked(callLLMQueued).mockRejectedValue(new Error('Unexpected error'))

      const request = createRequest('critique', { videoId: 'video-123' })
      const response = await POST(request, { params: Promise.resolve({ phase: 'critique' }) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('All valid phases', () => {
    it.each(['critique', 'edit-check', 'risk', 'chapters', 'title', 'description', 'tags'] as const)(
      'processes phase %s successfully',
      async (phase) => {
        // Use phase-specific mock response to avoid destructuring errors in persistence logic
        vi.mocked(callLLMQueued).mockResolvedValue({
          success: true,
          data: mockPhaseResponses[phase],
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        })

        const request = createRequest(phase, { videoId: 'video-123' })
        const response = await POST(request, { params: Promise.resolve({ phase }) })

        expect(response.status).toBe(200)
        expect(callLLMQueued).toHaveBeenCalledWith(
          phase,
          expect.anything(),
          undefined,
          expect.anything()
        )
      }
    )
  })

  describe('Phase data persistence', () => {
    it('persists critique for Phase 1', async () => {
      vi.mocked(callLLMQueued).mockResolvedValue({
        success: true,
        data: mockPhase1Response,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })

      const request = createRequest('critique', { videoId: 'video-123' })
      await POST(request, { params: Promise.resolve({ phase: 'critique' }) })

      expect(updateVideoAdmin).toHaveBeenCalledWith(
        expect.any(String),
        'video-123',
        { critique: mockPhase1Response.critique }
      )
    })

    it('persists editingIssues for Phase 2', async () => {
      vi.mocked(callLLMQueued).mockResolvedValue({
        success: true,
        data: mockPhase2Response,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })

      const request = createRequest('edit-check', { videoId: 'video-123' })
      await POST(request, { params: Promise.resolve({ phase: 'edit-check' }) })

      expect(updateVideoAdmin).toHaveBeenCalledWith(
        expect.any(String),
        'video-123',
        { editingIssues: mockPhase2Response.issues }
      )
    })

    it('persists riskAndCompliance for Phase 3', async () => {
      vi.mocked(callLLMQueued).mockResolvedValue({
        success: true,
        data: mockPhase3Response,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })

      const request = createRequest('risk', { videoId: 'video-123' })
      await POST(request, { params: Promise.resolve({ phase: 'risk' }) })

      expect(updateVideoAdmin).toHaveBeenCalledWith(
        expect.any(String),
        'video-123',
        { riskAndCompliance: mockPhase3Response.risks }
      )
    })

    it('persists chapters for Phase 4', async () => {
      vi.mocked(callLLMQueued).mockResolvedValue({
        success: true,
        data: mockPhase4Response,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })

      const request = createRequest('chapters', { videoId: 'video-123' })
      await POST(request, { params: Promise.resolve({ phase: 'chapters' }) })

      expect(updateVideoAdmin).toHaveBeenCalledWith(
        expect.any(String),
        'video-123',
        { chapters: mockPhase4Response.chapters }
      )
    })

    it('persists suggestedTitles for Phase 5', async () => {
      const mockPhase5Response = { titles: ['Title 1', 'Title 2', 'Title 3', 'Title 4', 'Title 5'] }
      vi.mocked(callLLMQueued).mockResolvedValue({
        success: true,
        data: mockPhase5Response,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })

      const request = createRequest('title', { videoId: 'video-123' })
      await POST(request, { params: Promise.resolve({ phase: 'title' }) })

      expect(updateVideoAdmin).toHaveBeenCalledWith(
        expect.any(String),
        'video-123',
        { suggestedTitles: mockPhase5Response.titles }
      )
    })

    it('persists description for Phase 6', async () => {
      vi.mocked(callLLMQueued).mockResolvedValue({
        success: true,
        data: mockPhaseResponses['description'],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })

      const request = createRequest('description', { videoId: 'video-123' })
      await POST(request, { params: Promise.resolve({ phase: 'description' }) })

      expect(updateVideoAdmin).toHaveBeenCalledWith(
        expect.any(String),
        'video-123',
        { description: mockPhaseResponses['description'].description }
      )
    })

    it('persists tags for Phase 7', async () => {
      vi.mocked(callLLMQueued).mockResolvedValue({
        success: true,
        data: mockPhaseResponses['tags'],
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      })

      const request = createRequest('tags', { videoId: 'video-123' })
      await POST(request, { params: Promise.resolve({ phase: 'tags' }) })

      expect(updateVideoAdmin).toHaveBeenCalledWith(
        expect.any(String),
        'video-123',
        { tags: mockPhaseResponses['tags'].tags }
      )
    })
  })
})
