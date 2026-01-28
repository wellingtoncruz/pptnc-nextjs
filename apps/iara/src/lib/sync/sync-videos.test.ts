import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock firebase-admin Timestamp
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromDate: (date: Date) => ({ toDate: () => date, _seconds: Math.floor(date.getTime() / 1000) }),
    now: () => ({ toDate: () => new Date(), _seconds: Math.floor(Date.now() / 1000) }),
  },
}))

// Store mock functions for per-test control
let mockListVideos: ReturnType<typeof vi.fn>
let mockDownloadPortugueseCaptions: ReturnType<typeof vi.fn>

// Mock YouTubeClient as a class
vi.mock('@/lib/youtube', () => ({
  YouTubeClient: class MockYouTubeClient {
    constructor(_accessToken: string) {}
    listVideos(...args: unknown[]) {
      return mockListVideos(...args)
    }
    downloadPortugueseCaptions(...args: unknown[]) {
      return mockDownloadPortugueseCaptions(...args)
    }
  },
  YouTubeAPIError: class MockYouTubeAPIError extends Error {
    code: string
    status?: number
    constructor(code: string, message: string, status?: number) {
      super(message)
      this.code = code
      this.status = status
      this.name = 'YouTubeAPIError'
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

// Mock srt-parser
vi.mock('@/lib/srt-parser', () => ({
  parseSrtToText: vi.fn((srt: string) => srt.replace(/\d+\n[\d:,]+ --> [\d:,]+\n/g, '').trim()),
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
    mockDownloadPortugueseCaptions = vi.fn().mockResolvedValue(null) // Default: no captions available
    mockGetPodcastAdmin.mockResolvedValue(mockPodcast as never)
    mockClassifyVideoType.mockReturnValue('episode')
  })

  describe('syncVideos', () => {
    it('returns zero counts when YouTube has no videos', async () => {
      mockListVideos.mockResolvedValue({ videos: [], nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])

      const result = await syncVideos('pptnc', 'access-token')

      expect(result).toEqual({
        added: 0,
        addedAsSent: 0,
        skipped: 0,
        reopened: 0,
        liveBroadcastsExcluded: 0,
        newVideos: 0,
        reopenedVideos: 0,
        transcriptionsFetched: 0,
        transcriptionsUnavailable: 0,
        quotaError: undefined,
      })
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
          privacyStatus: 'public' as const, // Public → addedAsSent
          liveBroadcastContent: 'none' as const,
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      // Public videos are added as 'sent', not 'new'
      expect(result.added).toBe(0)
      expect(result.addedAsSent).toBe(1)
      expect(result.newVideos).toBe(1)
      expect(result.skipped).toBe(0)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ id: 'new-video-1', status: 'sent' }),
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
          privacyStatus: 'public' as const,
          liveBroadcastContent: 'none' as const,
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
          privacyStatus: 'public' as const, // Public → sent
          liveBroadcastContent: 'none' as const,
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
          privacyStatus: 'public' as const, // Public → sent
          liveBroadcastContent: 'none' as const,
        },
      ]

      mockListVideos
        .mockResolvedValueOnce({ videos: page1Videos, nextPageToken: 'page2token' })
        .mockResolvedValueOnce({ videos: page2Videos, nextPageToken: undefined })

      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      // Both are public, so addedAsSent=2, added=0
      expect(result.newVideos).toBe(2)
      expect(result.addedAsSent).toBe(2)
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
          privacyStatus: 'unlisted' as const, // Non-public → new status
          liveBroadcastContent: 'none' as const,
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

    it('sets non-public videos with status "new"', async () => {
      const youtubeVideos = [
        {
          id: 'new-video',
          title: 'New Video',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/new-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'private' as const, // Non-public → new status
          liveBroadcastContent: 'none' as const,
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.added).toBe(1)
      expect(result.addedAsSent).toBe(0)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ status: 'new' }),
          ]),
        })
      )
    })

    it('sets public videos with status "sent"', async () => {
      const youtubeVideos = [
        {
          id: 'public-video',
          title: 'Public Video',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/public-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'public' as const, // Public → sent status
          liveBroadcastContent: 'none' as const,
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.added).toBe(0)
      expect(result.addedAsSent).toBe(1)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ status: 'sent' }),
          ]),
        })
      )
    })

    it('reopens sent videos when visibility changes to non-public', async () => {
      const youtubeVideos = [
        {
          id: 'sent-video',
          title: 'Previously Sent Video',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/sent-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'private' as const, // Changed from public to private
          liveBroadcastContent: 'none' as const,
        },
      ]

      const firestoreVideosRaw = [
        {
          id: 'sent-video',
          podcastId: 'pptnc',
          title: 'Previously Sent Video',
          status: 'sent',
          youtubePrivacyStatus: 'public', // Was public when sent
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue(firestoreVideosRaw)
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.reopened).toBe(1)
      expect(result.reopenedVideos).toBe(1)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: [],
          updates: expect.arrayContaining([
            expect.objectContaining({
              id: 'sent-video',
              data: expect.objectContaining({
                status: 'draft',
                youtubePrivacyStatus: 'private',
              }),
            }),
          ]),
        })
      )
    })

    it('throws error when podcast not found', async () => {
      mockGetPodcastAdmin.mockResolvedValue(null)

      await expect(syncVideos('nonexistent', 'access-token')).rejects.toThrow(
        'Podcast não encontrado: nonexistent'
      )
    })

    it('fetches transcriptions for new non-public videos', async () => {
      const youtubeVideos = [
        {
          id: 'new-video',
          title: 'New Video',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/new-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'private' as const, // Non-public → new status → needs transcription
          liveBroadcastContent: 'none' as const,
        },
      ]

      const srtContent = `1
00:00:00,000 --> 00:00:02,500
Olá mundo`

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)
      mockDownloadPortugueseCaptions.mockResolvedValue(srtContent)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.transcriptionsFetched).toBe(1)
      expect(result.transcriptionsUnavailable).toBe(0)
      expect(mockDownloadPortugueseCaptions).toHaveBeenCalledWith('new-video')
      // Should have been called twice: once for creates, once for transcription updates
      expect(mockBatchWriteVideos).toHaveBeenCalledTimes(2)
    })

    it('does not fetch transcriptions for public (sent) videos', async () => {
      const youtubeVideos = [
        {
          id: 'public-video',
          title: 'Public Video',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/public-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'public' as const, // Public → sent status → no transcription needed
          liveBroadcastContent: 'none' as const,
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.transcriptionsFetched).toBe(0)
      expect(result.transcriptionsUnavailable).toBe(0)
      expect(mockDownloadPortugueseCaptions).not.toHaveBeenCalled()
    })

    it('fetches transcriptions for reopened videos', async () => {
      const youtubeVideos = [
        {
          id: 'sent-video',
          title: 'Previously Sent Video',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/sent-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'private' as const, // Changed from public to private → reopen → needs transcription
          liveBroadcastContent: 'none' as const,
        },
      ]

      const firestoreVideosRaw = [
        {
          id: 'sent-video',
          podcastId: 'pptnc',
          title: 'Previously Sent Video',
          status: 'sent',
          youtubePrivacyStatus: 'public',
        },
      ]

      const srtContent = `1
00:00:00,000 --> 00:00:02,500
Olá mundo`

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue(firestoreVideosRaw)
      mockBatchWriteVideos.mockResolvedValue(undefined)
      mockDownloadPortugueseCaptions.mockResolvedValue(srtContent)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.reopened).toBe(1)
      expect(result.transcriptionsFetched).toBe(1)
      expect(mockDownloadPortugueseCaptions).toHaveBeenCalledWith('sent-video')
    })

    it('handles unavailable transcriptions gracefully', async () => {
      const youtubeVideos = [
        {
          id: 'new-video',
          title: 'New Video',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/new-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'private' as const,
          liveBroadcastContent: 'none' as const,
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)
      mockDownloadPortugueseCaptions.mockResolvedValue(null) // No captions available

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.transcriptionsFetched).toBe(0)
      expect(result.transcriptionsUnavailable).toBe(1)
      expect(result.quotaError).toBeUndefined()
    })

    it('excludes live broadcasts from import', async () => {
      const youtubeVideos = [
        {
          id: 'regular-video',
          title: 'Regular Video',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/regular-video/hqdefault.jpg',
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'public' as const,
          liveBroadcastContent: 'none' as const, // Regular video → should be imported
        },
        {
          id: 'live-video',
          title: 'Live Stream',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/live-video/hqdefault.jpg',
          duration: 7200,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'public' as const,
          liveBroadcastContent: 'live' as const, // Live broadcast → should be excluded
        },
        {
          id: 'upcoming-video',
          title: 'Upcoming Stream',
          description: 'Description',
          thumbnail: 'https://i.ytimg.com/vi/upcoming-video/hqdefault.jpg',
          duration: 0,
          publishedAt: '2024-01-16T00:00:00Z',
          privacyStatus: 'private' as const,
          liveBroadcastContent: 'upcoming' as const, // Upcoming broadcast → should be excluded
        },
      ]

      mockListVideos.mockResolvedValue({ videos: youtubeVideos, nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.liveBroadcastsExcluded).toBe(2) // live and upcoming
      expect(result.newVideos).toBe(1) // only regular-video
      expect(result.addedAsSent).toBe(1) // regular-video is public
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ id: 'regular-video' }),
          ]),
        })
      )
      // Should NOT include live or upcoming videos
      expect(mockBatchWriteVideos).not.toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ id: 'live-video' }),
          ]),
        })
      )
    })
  })
})
