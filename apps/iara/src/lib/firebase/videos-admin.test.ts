import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

// Mock firebase-admin/firestore
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockUpdate = vi.fn()
const mockCommit = vi.fn()
const mockBatch = vi.fn()
const mockOrderBy = vi.fn()
const mockWhere = vi.fn()
const mockSelect = vi.fn()

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
  },
}))

// Create mock doc ref factory
const createMockDocRef = () => ({
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
})

// Create mock collection ref factory
const createMockCollectionRef = () => ({
  doc: vi.fn(() => createMockDocRef()),
  orderBy: mockOrderBy,
  where: mockWhere,
  get: mockGet,
  select: mockSelect,
})

// Mock admin
vi.mock('./admin', () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: mockGet,
        set: mockSet,
        update: mockUpdate,
        collection: vi.fn(() => createMockCollectionRef()),
      })),
    })),
    batch: mockBatch,
  })),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import {
  getVideosByPodcastAdmin,
  getVideoAdmin,
  createVideoAdmin,
  updateVideoAdmin,
  softDeleteVideoAdmin,
  batchWriteVideos,
  getExistingVideoIds,
} from './videos-admin'

describe('videos-admin.ts - Admin SDK operations', () => {
  const mockTimestamp = { toDate: () => new Date('2024-01-15') }

  // Flat schema structure compatible with portal-web/EpisodeEntity
  const validVideoData = {
    podcastId: 'pptnc',
    title: 'Test Video',
    description: 'Test description',
    thumbnails: {
      high: { url: 'https://i.ytimg.com/vi/video-123/hqdefault.jpg', width: 480, height: 360 },
    },
    duration: 3600,
    publishedAt: mockTimestamp,
    status: 'new' as const,
    videoType: 'episode' as const,
    deleted: false,
    createdAt: mockTimestamp,
    updatedAt: mockTimestamp,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockBatch.mockReturnValue({
      set: vi.fn(),
      update: vi.fn(),
      commit: mockCommit,
    })
    // Setup orderBy to return chainable mock with get
    mockOrderBy.mockReturnValue({
      get: mockGet,
      where: mockWhere,
    })
    mockWhere.mockReturnValue({
      orderBy: mockOrderBy,
      get: mockGet,
    })
    // Setup select to return chainable mock with get (for getExistingVideoIds)
    mockSelect.mockReturnValue({
      get: mockGet,
    })
  })

  describe('getVideosByPodcastAdmin', () => {
    it('returns empty array when no videos exist', async () => {
      mockGet.mockResolvedValueOnce({
        empty: true,
        docs: [],
      })

      const result = await getVideosByPodcastAdmin('pptnc')

      expect(result).toEqual([])
    })

    it('returns validated videos for podcast', async () => {
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'video-123',
            data: () => validVideoData,
          },
        ],
      })

      const result = await getVideosByPodcastAdmin('pptnc')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('video-123')
    })
  })

  describe('getVideoAdmin', () => {
    it('returns null when video does not exist', async () => {
      mockGet.mockResolvedValueOnce({
        exists: false,
      })

      const result = await getVideoAdmin('pptnc', 'nonexistent')

      expect(result).toBeNull()
    })

    it('returns validated video when found', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        id: 'video-123',
        data: () => validVideoData,
      })

      const result = await getVideoAdmin('pptnc', 'video-123')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('video-123')
    })
  })

  describe('createVideoAdmin', () => {
    const validCreateData = {
      id: 'video-123',
      podcastId: 'pptnc',
      title: 'Test Video',
      description: 'Test description',
      thumbnails: {
        high: { url: 'https://i.ytimg.com/vi/video-123/hqdefault.jpg', width: 480, height: 360 },
      },
      duration: 3600,
      publishedAt: mockTimestamp,
      status: 'new' as const,
      videoType: 'episode' as const,
      youtubePrivacyStatus: 'private' as const,
    }

    it('creates video with validated data', async () => {
      mockSet.mockResolvedValueOnce(undefined)

      await createVideoAdmin(validCreateData)

      expect(mockSet).toHaveBeenCalled()
    })

    it('validates data before persisting (enforcement rule #2)', async () => {
      const invalidData = {
        ...validCreateData,
        status: 'invalid-status' as never,
      }

      await expect(createVideoAdmin(invalidData)).rejects.toThrow(ZodError)
      expect(mockSet).not.toHaveBeenCalled()
    })
  })

  describe('updateVideoAdmin', () => {
    it('updates video with validated data', async () => {
      // Mock the get() call for AUTO-DRAFT logic check
      mockGet.mockResolvedValueOnce({
        data: () => ({ status: 'draft' }), // Not 'new', so no auto-transition
      })
      mockUpdate.mockResolvedValueOnce(undefined)

      await updateVideoAdmin('pptnc', 'video-123', { deleted: true })

      expect(mockUpdate).toHaveBeenCalled()
    })

    it('validates data before persisting (enforcement rule #2)', async () => {
      await expect(
        updateVideoAdmin('pptnc', 'video-123', { status: 'invalid' as never })
      ).rejects.toThrow(ZodError)
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })

  describe('softDeleteVideoAdmin', () => {
    it('sets deleted flag to true', async () => {
      mockUpdate.mockResolvedValueOnce(undefined)

      await softDeleteVideoAdmin('pptnc', 'video-123')

      expect(mockUpdate).toHaveBeenCalled()
    })
  })

  describe('batchWriteVideos', () => {
    it('executes batch operations for creates, updates, and deletes', async () => {
      mockCommit.mockResolvedValueOnce(undefined)

      const createData = {
        id: 'new-video',
        podcastId: 'pptnc',
        title: 'New Video',
        description: 'Description',
        thumbnails: {
          high: { url: 'https://i.ytimg.com/vi/new-video/hqdefault.jpg', width: 480, height: 360 },
        },
        duration: 600,
        publishedAt: mockTimestamp,
        status: 'new' as const,
        videoType: 'cut' as const,
        youtubePrivacyStatus: 'private' as const,
      }

      await batchWriteVideos('pptnc', {
        creates: [createData],
        updates: [{ id: 'existing-video', data: { deleted: false } }],
        deletes: ['deleted-video'],
      })

      expect(mockCommit).toHaveBeenCalled()
    })

    it('handles empty operations', async () => {
      mockCommit.mockResolvedValueOnce(undefined)

      await batchWriteVideos('pptnc', {
        creates: [],
        updates: [],
        deletes: [],
      })

      // Should NOT commit when there are no operations
      expect(mockCommit).not.toHaveBeenCalled()
    })

    it('splits operations into batches of 500', async () => {
      mockCommit.mockResolvedValue(undefined)

      // Create 600 items (should require 2 batches)
      const creates = Array.from({ length: 600 }, (_, i) => ({
        id: `video-${i}`,
        podcastId: 'pptnc',
        title: `Video ${i}`,
        description: 'Description',
        thumbnails: {
          high: { url: `https://i.ytimg.com/vi/video-${i}/hqdefault.jpg`, width: 480, height: 360 },
        },
        duration: 600,
        publishedAt: mockTimestamp,
        status: 'new' as const,
        videoType: 'cut' as const,
        youtubePrivacyStatus: 'private' as const,
      }))

      await batchWriteVideos('pptnc', {
        creates,
        updates: [],
        deletes: [],
      })

      // Should have called commit at least twice (600 items / 500 per batch = 2 batches)
      expect(mockCommit).toHaveBeenCalledTimes(2)
    })
  })

  describe('getExistingVideoIds', () => {
    it('returns empty Set when no videos exist', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [],
      })

      const result = await getExistingVideoIds('pptnc')

      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(0)
    })

    it('returns Set of video IDs for delta sync', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [
          { id: 'video-1' },
          { id: 'video-2' },
          { id: 'video-3' },
        ],
      })

      const result = await getExistingVideoIds('pptnc')

      expect(result).toBeInstanceOf(Set)
      expect(result.size).toBe(3)
      expect(result.has('video-1')).toBe(true)
      expect(result.has('video-2')).toBe(true)
      expect(result.has('video-3')).toBe(true)
      expect(result.has('video-4')).toBe(false)
    })

    it('uses select() for optimized query (only IDs)', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [{ id: 'video-1' }],
      })

      await getExistingVideoIds('pptnc')

      // Verify select() was called (optimized query without fetching data)
      expect(mockSelect).toHaveBeenCalled()
    })
  })
})
