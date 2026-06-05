import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import { POST, DELETE } from './route'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: vi.fn(),
}))

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast-id',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { getAdminDb } from '@/lib/firebase/admin'

const mockAuth = vi.mocked(auth)
const mockGetVideoAdmin = vi.mocked(getVideoAdmin)
const mockGetAdminDb = vi.mocked(getAdminDb)

// Helper to create mock request
function createMockRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/videos/test-video/reviewed-phases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Helper to create route context
function createContext(videoId: string) {
  return {
    params: Promise.resolve({ videoId }),
  }
}

describe('POST /api/videos/[videoId]/reviewed-phases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const request = createMockRequest({ phase: 'edit-check' })
      const response = await POST(request, createContext('test-video'))

      expect(response.status).toBe(401)
      const json = await response.json()
      expect(json.error.code).toBe('AUTH_EXPIRED')
    })

    it('proceeds when authenticated', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockGetVideoAdmin.mockResolvedValue(null)

      const request = createMockRequest({ phase: 'edit-check' })
      const response = await POST(request, createContext('test-video'))

      // Should get past auth check (will fail on video not found)
      expect(response.status).toBe(404)
    })
  })

  describe('Validation', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 400 for invalid phase (not 2, 3 or 4)', async () => {
      mockGetVideoAdmin.mockResolvedValue({ id: 'test-video' } as never)

      const request = createMockRequest({ phase: 1 })
      const response = await POST(request, createContext('test-video'))

      expect(response.status).toBe(400)
    })

    it('accepts phase 4', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockGetVideoAdmin.mockResolvedValue({ id: 'test-video' } as never)

      const mockUpdate = vi.fn().mockResolvedValue(undefined)
      const mockDocRef = { update: mockUpdate }
      const mockCollection = vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(mockDocRef) })
      mockGetAdminDb.mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ collection: mockCollection }) }),
      } as never)

      const request = createMockRequest({ phase: 'chapters' })
      const response = await POST(request, createContext('test-video'))

      expect(response.status).toBe(200)
    })

    it('accepts phase links (Epic 26)', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockGetVideoAdmin.mockResolvedValue({ id: 'test-video' } as never)

      const mockUpdate = vi.fn().mockResolvedValue(undefined)
      const mockDocRef = { update: mockUpdate }
      const mockCollection = vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(mockDocRef) })
      mockGetAdminDb.mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ collection: mockCollection }) }),
      } as never)

      const request = createMockRequest({ phase: 'links' })
      const response = await POST(request, createContext('test-video'))

      expect(response.status).toBe(200)
    })

    it('returns 400 for non-number phase', async () => {
      mockGetVideoAdmin.mockResolvedValue({ id: 'test-video' } as never)

      const request = createMockRequest({ phase: 'two' })
      const response = await POST(request, createContext('test-video'))

      expect(response.status).toBe(400)
    })

    it('accepts phase 2', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockGetVideoAdmin.mockResolvedValue({ id: 'test-video' } as never)

      const mockUpdate = vi.fn().mockResolvedValue(undefined)
      const mockDocRef = { update: mockUpdate }
      const mockCollection = vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(mockDocRef) })
      mockGetAdminDb.mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ collection: mockCollection }) }),
      } as never)

      const request = createMockRequest({ phase: 'edit-check' })
      const response = await POST(request, createContext('test-video'))

      expect(response.status).toBe(200)
    })

    it('accepts phase 3', async () => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
      mockGetVideoAdmin.mockResolvedValue({ id: 'test-video' } as never)

      const mockUpdate = vi.fn().mockResolvedValue(undefined)
      const mockDocRef = { update: mockUpdate }
      const mockCollection = vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(mockDocRef) })
      mockGetAdminDb.mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ collection: mockCollection }) }),
      } as never)

      const request = createMockRequest({ phase: 'risk' })
      const response = await POST(request, createContext('test-video'))

      expect(response.status).toBe(200)
    })
  })

  describe('Video existence', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns 404 when video does not exist', async () => {
      mockGetVideoAdmin.mockResolvedValue(null)

      const request = createMockRequest({ phase: 'edit-check' })
      const response = await POST(request, createContext('non-existent'))

      expect(response.status).toBe(404)
      const json = await response.json()
      expect(json.error.code).toBe('NOT_FOUND')
    })
  })

  describe('Idempotency', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('returns success with alreadyReviewed=true when phase already reviewed', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        reviewedPhases: ['edit-check'],
      } as never)

      const request = createMockRequest({ phase: 'edit-check' })
      const response = await POST(request, createContext('test-video'))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.alreadyReviewed).toBe(true)
      expect(json.data.phase).toBe('edit-check')
    })

    it('returns success with alreadyReviewed=false for new review', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        reviewedPhases: [],
      } as never)

      const mockUpdate = vi.fn().mockResolvedValue(undefined)
      const mockDocRef = { update: mockUpdate }
      const mockCollection = vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(mockDocRef) })
      mockGetAdminDb.mockReturnValue({
        collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ collection: mockCollection }) }),
      } as never)

      const request = createMockRequest({ phase: 'edit-check' })
      const response = await POST(request, createContext('test-video'))

      expect(response.status).toBe(200)
      const json = await response.json()
      expect(json.data.alreadyReviewed).toBe(false)
    })
  })

  describe('Firestore update', () => {
    beforeEach(() => {
      mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    })

    it('calls Firestore update with arrayUnion', async () => {
      mockGetVideoAdmin.mockResolvedValue({
        id: 'test-video',
        reviewedPhases: [],
      } as never)

      const mockUpdate = vi.fn().mockResolvedValue(undefined)
      const mockDocRef = { update: mockUpdate }
      const mockDoc = vi.fn().mockReturnValue(mockDocRef)
      const mockVideosCollection = { doc: mockDoc }
      const mockPodcastDoc = { collection: vi.fn().mockReturnValue(mockVideosCollection) }
      const mockPodcastsCollection = { doc: vi.fn().mockReturnValue(mockPodcastDoc) }
      mockGetAdminDb.mockReturnValue({
        collection: vi.fn().mockReturnValue(mockPodcastsCollection),
      } as never)

      const request = createMockRequest({ phase: 'edit-check' })
      await POST(request, createContext('test-video'))

      expect(mockUpdate).toHaveBeenCalledTimes(1)
      const updateArg = mockUpdate.mock.calls[0][0]
      expect(updateArg).toHaveProperty('reviewedPhases')
      expect(updateArg).toHaveProperty('updatedAt')
    })
  })
})

describe('DELETE /api/videos/[videoId]/reviewed-phases (reprocess un-review, Epic 26)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createDeleteRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/videos/test-video/reviewed-phases', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const response = await DELETE(createDeleteRequest({ phase: 'edit-check' }), createContext('test-video'))
    expect(response.status).toBe(401)
  })

  it('removes the phase from reviewedPhases (arrayRemove) and returns 200', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    mockGetVideoAdmin.mockResolvedValue({ id: 'test-video', reviewedPhases: ['edit-check'] } as never)

    const mockUpdate = vi.fn().mockResolvedValue(undefined)
    const mockDocRef = { update: mockUpdate }
    const mockCollection = vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(mockDocRef) })
    mockGetAdminDb.mockReturnValue({
      collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ collection: mockCollection }) }),
    } as never)

    const response = await DELETE(createDeleteRequest({ phase: 'edit-check' }), createContext('test-video'))

    expect(response.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate.mock.calls[0][0]).toHaveProperty('reviewedPhases')
  })

  it('returns 404 when the video does not exist', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } } as never)
    mockGetVideoAdmin.mockResolvedValue(null)
    const response = await DELETE(createDeleteRequest({ phase: 'risk' }), createContext('test-video'))
    expect(response.status).toBe(404)
  })
})
