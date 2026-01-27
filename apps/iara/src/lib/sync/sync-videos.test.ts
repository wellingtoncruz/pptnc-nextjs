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
}))

import { getAllVideosRaw, batchWriteVideos } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { classifyVideoType } from '@/lib/video-utils'

import { syncVideos } from './sync-videos'

const mockGetAllVideosRaw = vi.mocked(getAllVideosRaw)
const mockBatchWriteVideos = vi.mocked(batchWriteVideos)
const mockGetPodcastAdmin = vi.mocked(getPodcastAdmin)
const mockClassifyVideoType = vi.mocked(classifyVideoType)

describe('sync-videos.ts - Video import (create only)', () => {
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

      const result = await syncVideos('pptnc', 'access-token')

      expect(result).toEqual({ added: 0, skipped: 0 })
      // batchWriteVideos should NOT be called when there are no new videos
      expect(mockBatchWriteVideos).not.toHaveBeenCalled()
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
      expect(result.skipped).toBe(0)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ id: 'new-video-1' }),
          ]),
          updates: [],
          deletes: [],
        })
      )
    })

    it('skips existing videos without modification', async () => {
      const youtubeVideos = [
        {
          id: 'existing-video',
          title: 'Updated Title', // Title changed on YouTube
          description: 'Updated description',
          thumbnail: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
        },
      ]

      const firestoreVideosRaw = [
        {
          id: 'existing-video',
          podcastId: 'pptnc',
          title: 'Old Title', // Different from YouTube
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

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.added).toBe(0)
      expect(result.skipped).toBe(1)
      // batchWriteVideos should NOT be called when there are no new videos
      expect(mockBatchWriteVideos).not.toHaveBeenCalled()
    })

    it('never deletes videos even if removed from YouTube', async () => {
      const youtubeVideos: never[] = [] // Video was removed from YouTube

      const firestoreVideosRaw = [
        {
          id: 'removed-from-youtube',
          podcastId: 'pptnc',
          title: 'Video removed from YouTube',
          description: 'Description',
          thumbnails: { high: { url: 'https://i.ytimg.com/vi/removed/hqdefault.jpg' } },
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

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.added).toBe(0)
      expect(result.skipped).toBe(0) // No YouTube videos to skip
      // batchWriteVideos should NOT be called - no deletes happen
      expect(mockBatchWriteVideos).not.toHaveBeenCalled()
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

    it('sets new videos with status "new"', async () => {
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

    it('throws error when podcast not found', async () => {
      mockGetPodcastAdmin.mockResolvedValue(null)

      await expect(syncVideos('nonexistent', 'access-token')).rejects.toThrow(
        'Podcast not found: nonexistent'
      )
    })
  })
})
