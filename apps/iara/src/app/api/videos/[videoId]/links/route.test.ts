import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PUT } from './route'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
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

import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'

const mockAuth = vi.mocked(auth)
const mockGetVideoAdmin = vi.mocked(getVideoAdmin)
const mockUpdateVideoAdmin = vi.mocked(updateVideoAdmin)

function createMockRequest(body: unknown): Request {
  return new Request('http://localhost/api/videos/test-video/links', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createContext(videoId: string) {
  return { params: Promise.resolve({ videoId }) }
}

const validLinks = [
  { url: 'https://github.com/exemplo/repo', description: 'Repositório', includeInDescription: true },
  { url: 'https://exemplo.com/artigo', description: 'Artigo citado', includeInDescription: false },
]

describe('PUT /api/videos/[videoId]/links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockGetVideoAdmin.mockResolvedValue({ id: 'test-video', videoType: 'episode' } as never)
    mockUpdateVideoAdmin.mockResolvedValue(undefined as never)
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await PUT(createMockRequest({ links: validLinks }), createContext('test-video'))

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })
  })

  describe('Body validation', () => {
    it('returns 400 when links is missing', async () => {
      const response = await PUT(createMockRequest({}), createContext('test-video'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_BODY')
    })

    it('returns 400 when a link has an invalid URL', async () => {
      const response = await PUT(
        createMockRequest({ links: [{ url: 'not-a-url', description: 'x' }] }),
        createContext('test-video')
      )

      expect(response.status).toBe(400)
      expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
    })

    it('returns 400 when a link has an empty description', async () => {
      const response = await PUT(
        createMockRequest({ links: [{ url: 'https://exemplo.com', description: '' }] }),
        createContext('test-video')
      )

      expect(response.status).toBe(400)
      expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
    })
  })

  describe('Video validation', () => {
    it('returns 404 when video does not exist', async () => {
      mockGetVideoAdmin.mockResolvedValue(null)

      const response = await PUT(createMockRequest({ links: validLinks }), createContext('test-video'))

      expect(response.status).toBe(404)
      const json = await response.json()
      expect(json.error.code).toBe('NOT_FOUND')
    })

    it('returns 400 when video is not an episode (episode-only scope, ADR-26.2)', async () => {
      mockGetVideoAdmin.mockResolvedValue({ id: 'test-video', videoType: 'cut' } as never)

      const response = await PUT(createMockRequest({ links: validLinks }), createContext('test-video'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error.code).toBe('INVALID_VIDEO_TYPE')
      expect(mockUpdateVideoAdmin).not.toHaveBeenCalled()
    })
  })

  describe('Success', () => {
    it('persists the full links array and echoes it back', async () => {
      const response = await PUT(createMockRequest({ links: validLinks }), createContext('test-video'))

      expect(response.status).toBe(200)
      expect(mockUpdateVideoAdmin).toHaveBeenCalledWith('test-podcast-id', 'test-video', {
        links: validLinks,
      })
      const json = await response.json()
      expect(json.data.links).toHaveLength(2)
    })

    it('accepts an empty array (removing all links is valid)', async () => {
      const response = await PUT(createMockRequest({ links: [] }), createContext('test-video'))

      expect(response.status).toBe(200)
      expect(mockUpdateVideoAdmin).toHaveBeenCalledWith('test-podcast-id', 'test-video', { links: [] })
    })

    it('defaults includeInDescription to false when omitted', async () => {
      const response = await PUT(
        createMockRequest({ links: [{ url: 'https://exemplo.com', description: 'Sem flag' }] }),
        createContext('test-video')
      )

      expect(response.status).toBe(200)
      expect(mockUpdateVideoAdmin).toHaveBeenCalledWith('test-podcast-id', 'test-video', {
        links: [{ url: 'https://exemplo.com', description: 'Sem flag', includeInDescription: false }],
      })
    })
  })

  describe('Error handling', () => {
    it('returns 500 when the update fails', async () => {
      mockUpdateVideoAdmin.mockRejectedValue(new Error('firestore down'))

      const response = await PUT(createMockRequest({ links: validLinks }), createContext('test-video'))

      expect(response.status).toBe(500)
      const json = await response.json()
      expect(json.error.code).toBe('INTERNAL_ERROR')
    })
  })
})
