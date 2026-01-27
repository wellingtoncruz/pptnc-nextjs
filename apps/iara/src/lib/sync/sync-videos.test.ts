import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock firebase-admin Timestamp
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromDate: (date: Date) => ({ toDate: () => date, _seconds: Math.floor(date.getTime() / 1000) }),
  },
}))

// Store mock listVideos for per-test control
let mockListVideos: ReturnType<typeof vi.fn>

// Mock YouTubeClient as a class
vi.mock('@/lib/youtube', () => ({
  YouTubeClient: class MockYouTubeClient {
    constructor(_accessToken: string) {}
    listVideos(...args: unknown[]) {
      return mockListVideos(...args)
    }
  },
}))

// Mock videos-admin
vi.mock('@/lib/firebase/videos-admin', () => ({
  getAllVideosRaw: vi.fn(),
  batchWriteVideos: vi.fn(),
}))

// Mock podcasts-admin
vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastAdmin: vi.fn(),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Mock video-utils
vi.mock('@/lib/video-utils', () => ({
  classifyVideoType: vi.fn(),
  needsIaraFields: vi.fn((data) => !('status' in data) || !('videoType' in data)),
}))

import { getAllVideosRaw, batchWriteVideos } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { classifyVideoType, needsIaraFields } from '@/lib/video-utils'

import { syncVideos } from './sync-videos'

const mockGetAllVideosRaw = vi.mocked(getAllVideosRaw)
const mockBatchWriteVideos = vi.mocked(batchWriteVideos)
const mockGetPodcastAdmin = vi.mocked(getPodcastAdmin)
const mockClassifyVideoType = vi.mocked(classifyVideoType)
const mockNeedsIaraFields = vi.mocked(needsIaraFields)

describe('sync-videos.ts - Video synchronization', () => {
  const mockTimestamp = { toDate: () => new Date('2024-01-15') }
  const mockVideoTypes = {
    episode: { minDuration: 1200, maxDuration: null },
    cut: { minDuration: 180, maxDuration: 1199 },
    reel: { minDuration: 0, maxDuration: 179 },
  }

  const mockPodcast = {
    id: 'pptnc',
    name: 'Test Podcast',
    ownerId: 'user-123',
    channelId: 'UC123',
    videoTypes: mockVideoTypes,
    prompts: {},
    createdAt: mockTimestamp,
    updatedAt: mockTimestamp,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockListVideos = vi.fn()
    mockGetPodcastAdmin.mockResolvedValue(mockPodcast as never)
    mockClassifyVideoType.mockReturnValue('episode')
  })

  describe('syncVideos', () => {
    it('returns zero counts when YouTube has no videos', async () => {
      mockListVideos.mockResolvedValue({ videos: [], nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result).toEqual({ added: 0, updated: 0, deleted: 0 })
    })

    it('creates new videos not in Firestore', async () => {
      const youtubeVideos = [
        {
          id: 'new-video-1',
          title: 'New Video 1',
          description: 'Description 1',
          thumbnail: 'https://i.ytimg.com/vi/new-video-1/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.added).toBe(1)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ id: 'new-video-1' }),
          ]),
        })
      )
    })

    it('updates existing videos with YouTube data changes', async () => {
      const youtubeVideos = [
        {
          id: 'existing-video',
          title: 'Updated Title',
          description: 'Updated description',
          thumbnail: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
        },
      ]

      // Raw format with flat fields and IAra fields (status, videoType)
      const firestoreVideosRaw = [
        {
          id: 'existing-video',
          podcastId: 'pptnc',
          title: 'Old Title',
          description: 'Old description',
          thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg' } },
          duration: 3600,
          publishedAt: mockTimestamp,
          status: 'draft',
          videoType: 'episode',
          deleted: false,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue(firestoreVideosRaw)
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.updated).toBe(1)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          updates: expect.arrayContaining([
            expect.objectContaining({
              id: 'existing-video',
              data: expect.objectContaining({
                title: 'Updated Title',
              }),
            }),
          ]),
        })
      )
    })

    it('preserves status when updating existing videos with IAra fields (AC #2)', async () => {
      const youtubeVideos = [
        {
          id: 'existing-video',
          title: 'Updated Title',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
        },
      ]

      // Video with IAra fields (status, videoType) already present
      const firestoreVideosRaw = [
        {
          id: 'existing-video',
          podcastId: 'pptnc',
          title: 'Old Title',
          description: 'Description',
          thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg' } },
          duration: 3600,
          publishedAt: mockTimestamp,
          status: 'ready', // Should NOT change
          videoType: 'episode',
          deleted: false,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue(firestoreVideosRaw)
      mockBatchWriteVideos.mockResolvedValue(undefined)

      await syncVideos('pptnc', 'access-token')

      // Status should NOT be in the update data for videos that already have IAra fields
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          updates: expect.arrayContaining([
            expect.objectContaining({
              data: expect.not.objectContaining({ status: expect.anything() }),
            }),
          ]),
        })
      )
    })

    it('soft deletes videos not in YouTube anymore (AC #3)', async () => {
      const youtubeVideos: never[] = [] // Video was removed from YouTube

      const firestoreVideosRaw = [
        {
          id: 'deleted-video',
          podcastId: 'pptnc',
          title: 'Deleted Video',
          description: 'Description',
          thumbnails: { high: { url: 'https://i.ytimg.com/vi/deleted-video/hqdefault.jpg' } },
          duration: 3600,
          publishedAt: mockTimestamp,
          status: 'draft',
          videoType: 'episode',
          deleted: false, // Not deleted yet
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue(firestoreVideosRaw)
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.deleted).toBe(1)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          deletes: ['deleted-video'],
        })
      )
    })

    it('does not re-delete already deleted videos', async () => {
      const youtubeVideos: never[] = []

      const firestoreVideosRaw = [
        {
          id: 'already-deleted',
          podcastId: 'pptnc',
          title: 'Already Deleted Video',
          description: 'Description',
          thumbnails: { high: { url: 'https://i.ytimg.com/vi/already-deleted/hqdefault.jpg' } },
          duration: 3600,
          publishedAt: mockTimestamp,
          status: 'draft',
          videoType: 'episode',
          deleted: true, // Already deleted
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue(firestoreVideosRaw)
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.deleted).toBe(0)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          deletes: [],
        })
      )
    })

    it('handles pagination from YouTube API', async () => {
      const page1Videos = [
        {
          id: 'video-1',
          title: 'Video 1',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/video-1/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
        },
      ]
      const page2Videos = [
        {
          id: 'video-2',
          title: 'Video 2',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/video-2/hqdefault.jpg',
          duration: 600,
          publishedAt: '2024-01-15T00:00:00Z',
        },
      ]

      mockListVideos
        .mockResolvedValueOnce({ videos: page1Videos, nextPageToken: 'page2token' })
        .mockResolvedValueOnce({ videos: page2Videos, nextPageToken: undefined })

      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.added).toBe(2)
      expect(mockListVideos).toHaveBeenCalledTimes(2)
    })

    it('classifies video type using podcast config', async () => {
      const youtubeVideos = [
        {
          id: 'new-video',
          title: 'New Video',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/new-video/hqdefault.jpg',
          duration: 600, // 10 minutes = cut
          publishedAt: '2024-01-15T00:00:00Z',
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)
      mockClassifyVideoType.mockReturnValue('cut')

      await syncVideos('pptnc', 'access-token')

      expect(mockClassifyVideoType).toHaveBeenCalledWith(600, mockVideoTypes)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ videoType: 'cut' }),
          ]),
        })
      )
    })

    it('sets new videos with status "new" (AC #1)', async () => {
      const youtubeVideos = [
        {
          id: 'new-video',
          title: 'New Video',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/new-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      await syncVideos('pptnc', 'access-token')

      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ status: 'new' }),
          ]),
        })
      )
    })

    it('enriches videos without IAra fields on update', async () => {
      const youtubeVideos = [
        {
          id: 'legacy-video',
          title: 'Legacy Video',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/legacy-video/hqdefault.jpg',
          duration: 600,
          publishedAt: '2024-01-15T00:00:00Z',
        },
      ]

      // Video without IAra fields (no status or videoType)
      const firestoreVideosRaw = [
        {
          id: 'legacy-video',
          title: 'Legacy Video',
          description: 'Description',
          thumbnails: { high: { url: 'https://i.ytimg.com/vi/legacy-video/hqdefault.jpg' } },
          duration: 600,
          publishedAt: mockTimestamp,
          // No status or videoType - needs IAra enrichment
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue(firestoreVideosRaw)
      mockBatchWriteVideos.mockResolvedValue(undefined)
      mockClassifyVideoType.mockReturnValue('cut')

      await syncVideos('pptnc', 'access-token')

      // Should update with IAra fields (status, videoType) added
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          updates: expect.arrayContaining([
            expect.objectContaining({
              id: 'legacy-video',
              data: expect.objectContaining({
                status: 'new',
                videoType: 'cut',
                title: 'Legacy Video',
              }),
            }),
          ]),
        })
      )
    })

    it('throws error when podcast not found', async () => {
      mockGetPodcastAdmin.mockResolvedValue(null)

      await expect(syncVideos('nonexistent', 'access-token')).rejects.toThrow(
        'Podcast not found: nonexistent'
      )
    })
  })
})
