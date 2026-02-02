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
  PROJECT_ID: 'test-project',
  GCP_REGION: 'us-central1',
  VERTEX_AI_MODEL: 'gemini-2.5-flash',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Mock Vertex AI
const mockGenerateContent = vi.fn()
vi.mock('@google-cloud/vertexai', () => {
  return {
    VertexAI: class MockVertexAI {
      constructor() {}
      getGenerativeModel() {
        return {
          generateContent: mockGenerateContent,
        }
      }
    },
  }
})

// Mock LLM utilities
vi.mock('@/lib/llm', async () => {
  const actual = await vi.importActual('@/lib/llm')
  return {
    ...actual,
    createTranscriptionFile: vi.fn().mockResolvedValue('/tmp/test-transcription.txt'),
    cleanupTranscriptionFile: vi.fn().mockResolvedValue(undefined),
    parseJSONFromLLM: vi.fn(),
  }
})

// Mock fs for file reading
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue(Buffer.from('test transcription content')),
  },
  readFile: vi.fn().mockResolvedValue(Buffer.from('test transcription content')),
}))

import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { parseJSONFromLLM } from '@/lib/llm'

const mockAuth = vi.mocked(auth)
const mockGetVideoAdmin = vi.mocked(getVideoAdmin)
const mockUpdateVideoAdmin = vi.mocked(updateVideoAdmin)
const mockGetPodcastAdmin = vi.mocked(getPodcastAdmin)
const mockParseJSONFromLLM = vi.mocked(parseJSONFromLLM)

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

      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: {
              parts: [{ text: '{"shortTitles": ["Short 1", "Short 2", "Short 3", "Short 4", "Short 5"]}' }],
            },
          }],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            totalTokenCount: 150,
          },
        },
      })

      mockParseJSONFromLLM.mockReturnValue({
        shortTitles: ['Short 1', 'Short 2', 'Short 3', 'Short 4', 'Short 5'],
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

    it('accepts additionalContext for revalidation', async () => {
      const request = createMockRequest({
        videoId: 'cut-video',
        additionalContext: 'Focus on the main guest',
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
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

    it('returns 500 when LLM returns invalid response', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: { parts: [{ text: 'not json' }] },
          }],
        },
      })
      mockParseJSONFromLLM.mockReturnValue(null)

      const request = createMockRequest({ videoId: 'cut-video' })
      const response = await POST(request)

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('PARSE_ERROR')
    })

    it('returns 500 when LLM returns no text', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: { parts: [] },
          }],
        },
      })

      const request = createMockRequest({ videoId: 'cut-video' })
      const response = await POST(request)

      expect(response.status).toBe(500)
    })
  })
})
