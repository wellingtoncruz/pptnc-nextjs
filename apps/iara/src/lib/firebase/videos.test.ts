import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
}))

// Mock client
vi.mock('./client', () => ({
  getDb: vi.fn(() => ({})),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Mock video-utils
vi.mock('@/lib/video-utils', () => ({
  needsIaraFields: vi.fn((data) => !('status' in data) || !('videoType' in data)),
  getBestThumbnailUrl: vi.fn((thumbnails) => thumbnails?.high?.url ?? ''),
}))

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { getDb } from './client'

import {
  getVideosByPodcast,
  getVideo,
  createVideo,
  updateVideo,
  softDeleteVideo,
} from './videos'

const mockGetDb = vi.mocked(getDb)
const mockCollection = vi.mocked(collection)
const mockDoc = vi.mocked(doc)
const mockGetDoc = vi.mocked(getDoc)
const mockGetDocs = vi.mocked(getDocs)
const mockSetDoc = vi.mocked(setDoc)
const mockUpdateDoc = vi.mocked(updateDoc)

describe('videos.ts - Client SDK operations', () => {
  const mockDb = { type: 'mock-firestore' }
  const mockDocRef = { id: 'video-123', path: 'podcasts/pptnc/videos/video-123' }
  const mockCollectionRef = { path: 'podcasts/pptnc/videos' }
  const mockTimestamp = { toDate: () => new Date('2024-01-15') }

  // Flat schema structure compatible with portal-web/EpisodeEntity
  const validVideoData = {
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
    deleted: false,
    createdAt: mockTimestamp,
    updatedAt: mockTimestamp,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDb.mockReturnValue(mockDb as never)
    mockCollection.mockReturnValue(mockCollectionRef as never)
    mockDoc.mockReturnValue(mockDocRef as never)
  })

  describe('getVideosByPodcast', () => {
    it('returns empty array when no videos exist', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [],
        empty: true,
      } as never)

      const result = await getVideosByPodcast('pptnc')

      expect(result).toEqual([])
      expect(mockCollection).toHaveBeenCalledWith(mockDb, 'podcasts', 'pptnc', 'videos')
    })

    it('returns validated videos for podcast', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            id: 'video-123',
            data: () => ({
              podcastId: 'pptnc',
              title: 'Test Video',
              description: 'Test description',
              thumbnails: validVideoData.thumbnails,
              duration: 3600,
              publishedAt: mockTimestamp,
              status: 'new',
              videoType: 'episode',
              deleted: false,
              createdAt: mockTimestamp,
              updatedAt: mockTimestamp,
            }),
          },
        ],
        empty: false,
      } as never)

      const result = await getVideosByPodcast('pptnc')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('video-123')
      expect(result[0].podcastId).toBe('pptnc')
    })

    it('excludes deleted videos by default (filtering in memory)', async () => {
      // New implementation fetches all docs and filters in memory
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            id: 'video-123',
            data: () => ({
              podcastId: 'pptnc',
              title: 'Test Video',
              description: 'Test description',
              thumbnails: validVideoData.thumbnails,
              duration: 3600,
              publishedAt: mockTimestamp,
              status: 'new',
              videoType: 'episode',
              deleted: false,
              createdAt: mockTimestamp,
              updatedAt: mockTimestamp,
            }),
          },
          {
            id: 'video-deleted',
            data: () => ({
              podcastId: 'pptnc',
              title: 'Deleted Video',
              description: 'Test description',
              thumbnails: validVideoData.thumbnails,
              duration: 3600,
              publishedAt: mockTimestamp,
              status: 'new',
              videoType: 'episode',
              deleted: true, // This one should be filtered out
              createdAt: mockTimestamp,
              updatedAt: mockTimestamp,
            }),
          },
        ],
        empty: false,
      } as never)

      const result = await getVideosByPodcast('pptnc')

      // Should only return non-deleted video
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('video-123')
    })

    it('includes deleted videos when includeDeleted is true', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            id: 'video-123',
            data: () => ({
              podcastId: 'pptnc',
              title: 'Test Video',
              description: 'Test description',
              thumbnails: validVideoData.thumbnails,
              duration: 3600,
              publishedAt: mockTimestamp,
              status: 'new',
              videoType: 'episode',
              deleted: false,
              createdAt: mockTimestamp,
              updatedAt: mockTimestamp,
            }),
          },
          {
            id: 'video-deleted',
            data: () => ({
              podcastId: 'pptnc',
              title: 'Deleted Video',
              description: 'Test description',
              thumbnails: validVideoData.thumbnails,
              duration: 3600,
              publishedAt: mockTimestamp,
              status: 'sent',
              videoType: 'episode',
              deleted: true,
              createdAt: mockTimestamp,
              updatedAt: mockTimestamp,
            }),
          },
        ],
        empty: false,
      } as never)

      const result = await getVideosByPodcast('pptnc', { includeDeleted: true })

      // Should return both videos
      expect(result).toHaveLength(2)
    })
  })

  describe('getVideo', () => {
    it('returns null when video does not exist', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => false,
      } as never)

      const result = await getVideo('pptnc', 'nonexistent')

      expect(result).toBeNull()
    })

    it('returns validated video when found', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'video-123',
        data: () => ({
          podcastId: 'pptnc',
          title: 'Test Video',
          description: 'Test description',
          thumbnails: validVideoData.thumbnails,
          duration: 3600,
          publishedAt: mockTimestamp,
          status: 'new',
          videoType: 'episode',
          deleted: false,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
        }),
      } as never)

      const result = await getVideo('pptnc', 'video-123')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('video-123')
      expect(result?.podcastId).toBe('pptnc')
    })

    it('throws ZodError when data fails validation', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        id: 'video-123',
        data: () => ({
          // Flat schema with invalid data (empty title)
          podcastId: 'pptnc',
          title: '', // Empty title should fail validation
          description: 'test',
          thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
          duration: 100,
          publishedAt: { toDate: () => new Date() },
          status: 'new',
          videoType: 'episode',
          deleted: false,
          createdAt: { toDate: () => new Date() },
          updatedAt: { toDate: () => new Date() },
        }),
      } as never)

      await expect(getVideo('pptnc', 'video-123')).rejects.toThrow(ZodError)
    })
  })

  describe('createVideo', () => {
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
      deleted: false,
    }

    it('creates video with validated data', async () => {
      mockSetDoc.mockResolvedValueOnce(undefined)

      await createVideo(validCreateData)

      expect(mockSetDoc).toHaveBeenCalled()
      expect(mockDoc).toHaveBeenCalledWith(
        mockDb,
        'podcasts',
        'pptnc',
        'videos',
        'video-123'
      )
    })

    it('validates data before persisting (enforcement rule #2)', async () => {
      const invalidData = {
        ...validCreateData,
        status: 'invalid-status' as never, // Invalid status
      }

      await expect(createVideo(invalidData)).rejects.toThrow(ZodError)
      expect(mockSetDoc).not.toHaveBeenCalled()
    })

    it('adds createdAt and updatedAt timestamps', async () => {
      mockSetDoc.mockResolvedValueOnce(undefined)

      await createVideo(validCreateData)

      const setDocCall = mockSetDoc.mock.calls[0]
      expect(setDocCall[1]).toHaveProperty('createdAt')
      expect(setDocCall[1]).toHaveProperty('updatedAt')
    })
  })

  describe('updateVideo', () => {
    it('updates video with validated data', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined)

      await updateVideo('pptnc', 'video-123', {
        title: 'Updated Title',
        description: 'Updated description',
      })

      expect(mockUpdateDoc).toHaveBeenCalled()
    })

    it('validates data before persisting (enforcement rule #2)', async () => {
      await expect(
        updateVideo('pptnc', 'video-123', {
          status: 'invalid-status' as never,
        })
      ).rejects.toThrow(ZodError)
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('adds updatedAt timestamp', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined)

      await updateVideo('pptnc', 'video-123', { deleted: true })

      const updateDocCall = mockUpdateDoc.mock.calls[0]
      expect(updateDocCall[1]).toHaveProperty('updatedAt')
    })

    it('uses updateDoc not setDoc (enforcement rule #4)', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined)

      await updateVideo('pptnc', 'video-123', { deleted: true })

      expect(mockUpdateDoc).toHaveBeenCalled()
      expect(mockSetDoc).not.toHaveBeenCalled()
    })
  })

  describe('softDeleteVideo', () => {
    it('sets deleted flag to true', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined)

      await softDeleteVideo('pptnc', 'video-123')

      const updateDocCall = mockUpdateDoc.mock.calls[0]
      expect(updateDocCall[1]).toHaveProperty('deleted', true)
    })

    it('adds updatedAt timestamp', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined)

      await softDeleteVideo('pptnc', 'video-123')

      const updateDocCall = mockUpdateDoc.mock.calls[0]
      expect(updateDocCall[1]).toHaveProperty('updatedAt')
    })

    it('does not physically delete the document', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined)

      await softDeleteVideo('pptnc', 'video-123')

      // Should use updateDoc, not deleteDoc
      expect(mockUpdateDoc).toHaveBeenCalled()
    })
  })
})
