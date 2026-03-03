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
let mockListPlaylistItems: ReturnType<typeof vi.fn>
let mockGetVideoDetails: ReturnType<typeof vi.fn>
let mockGetVideoDetailsBatch: ReturnType<typeof vi.fn>

// Mock YouTubeClient as a class
// Note: downloadPortugueseCaptions is no longer used in sync (Story 5.6 - Transcrição On-Demand)
vi.mock('@/lib/youtube', () => ({
  YouTubeClient: class MockYouTubeClient {
    constructor(_accessToken: string) {}
    // Legacy method (still used by some tests)
    listVideos(...args: unknown[]) {
      return mockListVideos(...args)
    }
    // 2-phase flow methods (Story 7.2)
    listPlaylistItems(...args: unknown[]) {
      return mockListPlaylistItems(...args)
    }
    getVideoDetails(...args: unknown[]) {
      return mockGetVideoDetails(...args)
    }
    getVideoDetailsBatch(...args: unknown[]) {
      return mockGetVideoDetailsBatch(...args)
    }
    // Static method for channel ID conversion
    static channelIdToUploadsPlaylist(channelId: string) {
      if (!channelId.startsWith('UC')) {
        throw new Error(`Invalid channel ID format: ${channelId}`)
      }
      return 'UU' + channelId.substring(2)
    }
  },
}))

// Mock videos-admin
vi.mock('@/lib/firebase/videos-admin', () => ({
  getAllVideosRaw: vi.fn(),
  batchWriteVideos: vi.fn(),
  getExistingVideoIds: vi.fn(),
}))

// Mock podcasts-admin
vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastAdmin: vi.fn(),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Mock storage-admin for thumbnail uploads (Story 7.3)
let mockUploadVideoThumbnail: ReturnType<typeof vi.fn>
vi.mock('@/lib/firebase/storage-admin', () => ({
  uploadVideoThumbnail: (...args: unknown[]) => mockUploadVideoThumbnail(...args),
}))

// Mock video-utils
vi.mock('@/lib/video-utils', () => ({
  classifyVideoType: vi.fn(),
}))

// Mock embedding service (Epic 17)
vi.mock('@/lib/embedding/video-embedding', () => ({
  embedVideos: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
}))

import { getAllVideosRaw, batchWriteVideos, getExistingVideoIds } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { classifyVideoType } from '@/lib/video-utils'
import { embedVideos } from '@/lib/embedding/video-embedding'

import { syncVideos, youtubeToVideoCreate, getInitialStatusFromVisibility } from './sync-videos'

/**
 * Helper to create thumbnails object from video ID.
 */
function makeThumbnails(videoId: string) {
  return {
    high: { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, width: 480, height: 360 },
  }
}

const mockGetAllVideosRaw = vi.mocked(getAllVideosRaw)
const mockBatchWriteVideos = vi.mocked(batchWriteVideos)
const mockGetExistingVideoIds = vi.mocked(getExistingVideoIds)
const mockGetPodcastAdmin = vi.mocked(getPodcastAdmin)
const mockClassifyVideoType = vi.mocked(classifyVideoType)
const mockEmbedVideos = vi.mocked(embedVideos)

describe('getInitialStatusFromVisibility', () => {
  it('returns sent for public videos', () => {
    expect(getInitialStatusFromVisibility('public')).toBe('sent')
  })

  it('returns new for private videos', () => {
    expect(getInitialStatusFromVisibility('private')).toBe('new')
  })

  it('returns new for unlisted videos', () => {
    expect(getInitialStatusFromVisibility('unlisted')).toBe('new')
  })
})

describe('youtubeToVideoCreate', () => {
  it('is importable from sync-videos', () => {
    expect(typeof youtubeToVideoCreate).toBe('function')
  })
})

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
    // Legacy mock (some tests still use listVideos)
    mockListVideos = vi.fn()
    // 2-phase flow mocks (Story 7.2)
    mockListPlaylistItems = vi.fn()
    mockGetVideoDetails = vi.fn().mockResolvedValue([])
    mockGetVideoDetailsBatch = vi.fn().mockResolvedValue([])
    // Thumbnail upload mock (Story 7.3)
    mockUploadVideoThumbnail = vi.fn().mockResolvedValue('https://storage.example.com/thumbnail.jpg')
    mockGetPodcastAdmin.mockResolvedValue(mockPodcast as never)
    mockClassifyVideoType.mockReturnValue('episode')
    // Default: empty Set for delta sync (simulates first sync or no existing videos)
    mockGetExistingVideoIds.mockResolvedValue(new Set())
  })

  describe('syncVideos', () => {
    it('returns zero counts when YouTube has no videos', async () => {
      // 2-phase flow: listPlaylistItems returns empty
      mockListPlaylistItems.mockResolvedValue({ videoIds: [], nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue([])

      const result = await syncVideos('pptnc', 'access-token')

      // Note: transcription fields removed per Story 5.6 (Transcrição On-Demand)
      expect(result).toEqual({
        added: 0,
        addedAsSent: 0,
        skipped: 0,
        reopened: 0,
        liveBroadcastsExcluded: 0,
        newVideos: 0,
        reopenedVideos: 0,
      })
      // batchWriteVideos should NOT be called when there are no new videos
      expect(mockBatchWriteVideos).not.toHaveBeenCalled()
      // getVideoDetailsBatch should NOT be called when no IDs to fetch
      expect(mockGetVideoDetailsBatch).not.toHaveBeenCalled()
    })

    it('creates new videos not in Firestore', async () => {
      const youtubeVideos = [
        {
          id: 'new-video-1',
          title: 'New Video 1',
          description: 'Description 1',
          thumbnails: makeThumbnails('new-video-1'),
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'public' as const, // Public → addedAsSent
          liveBroadcastContent: 'none' as const,
        },
      ]

      // 2-phase flow: Phase 1 returns IDs, Phase 2 returns details
      mockListPlaylistItems.mockResolvedValue({ videoIds: ['new-video-1'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
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
            expect.objectContaining({ id: 'new-video-1', status: 'sent', hasEmbedding: false }),
          ]),
          updates: [],
          deletes: [],
        })
      )
    })

    it('skips existing videos without modification (delta sync)', async () => {
      // With delta sync, existing videos are detected via getExistingVideoIds
      // and the sync stops early when encountering them
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

      // Delta sync: existing video ID is in the Set
      mockGetExistingVideoIds.mockResolvedValue(new Set(['existing-video']))
      // 2-phase flow: Phase 1 returns the ID, but it's in existingIds so it's skipped
      mockListPlaylistItems.mockResolvedValue({ videoIds: ['existing-video'], nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue(firestoreVideosRaw)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.added).toBe(0)
      expect(result.skipped).toBe(1) // Skipped count = existingIds.size
      // batchWriteVideos should NOT be called when there are no new videos
      expect(mockBatchWriteVideos).not.toHaveBeenCalled()
      // getVideoDetailsBatch should NOT be called when no new IDs
      expect(mockGetVideoDetailsBatch).not.toHaveBeenCalled()
    })

    it('never deletes videos even if removed from YouTube', async () => {
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

      // 2-phase flow: Phase 1 returns empty (video removed from YouTube)
      mockListPlaylistItems.mockResolvedValue({ videoIds: [], nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue(firestoreVideosRaw)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.added).toBe(0)
      expect(result.skipped).toBe(0) // No YouTube videos to skip
      // batchWriteVideos should NOT be called - no deletes happen
      expect(mockBatchWriteVideos).not.toHaveBeenCalled()
    })

    it('handles pagination from YouTube API', async () => {
      const allVideos = [
        {
          id: 'video-1',
          title: 'Video 1',
          description: 'Description',
          thumbnails: makeThumbnails('video-1'),
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'public' as const, // Public → sent
          liveBroadcastContent: 'none' as const,
        },
        {
          id: 'video-2',
          title: 'Video 2',
          description: 'Description',
          thumbnails: makeThumbnails('video-2'),
          duration: 600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'public' as const, // Public → sent
          liveBroadcastContent: 'none' as const,
        },
      ]

      // 2-phase flow: Phase 1 returns IDs across multiple pages
      mockListPlaylistItems
        .mockResolvedValueOnce({ videoIds: ['video-1'], nextPageToken: 'page2token' })
        .mockResolvedValueOnce({ videoIds: ['video-2'], nextPageToken: undefined })

      // Phase 2: getVideoDetailsBatch fetches all new IDs in one batch
      mockGetVideoDetailsBatch.mockResolvedValue(allVideos)
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      // Both are public, so addedAsSent=2, added=0
      expect(result.newVideos).toBe(2)
      expect(result.addedAsSent).toBe(2)
      expect(mockListPlaylistItems).toHaveBeenCalledTimes(2)
      // getVideoDetailsBatch called once with all IDs
      expect(mockGetVideoDetailsBatch).toHaveBeenCalledTimes(1)
      expect(mockGetVideoDetailsBatch).toHaveBeenCalledWith(['video-1', 'video-2'])
    })

    it('classifies video type using podcast config', async () => {
      const youtubeVideos = [
        {
          id: 'new-video',
          title: 'New Video',
          description: 'Description',
          thumbnails: makeThumbnails('new-video'),
          duration: 600, // 10 minutes = cut
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'unlisted' as const, // Non-public → new status
          liveBroadcastContent: 'none' as const,
        },
      ]

      // 2-phase flow
      mockListPlaylistItems.mockResolvedValue({ videoIds: ['new-video'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)
      mockClassifyVideoType.mockReturnValue('cut')

      await syncVideos('pptnc', 'access-token')

      expect(mockClassifyVideoType).toHaveBeenCalledWith(600, mockVideoTypes)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ videoType: 'cut', hasEmbedding: false }),
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
          thumbnails: makeThumbnails('new-video'),
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'private' as const, // Non-public → new status
          liveBroadcastContent: 'none' as const,
        },
      ]

      // 2-phase flow
      mockListPlaylistItems.mockResolvedValue({ videoIds: ['new-video'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.added).toBe(1)
      expect(result.addedAsSent).toBe(0)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ status: 'new', hasEmbedding: false }),
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
          thumbnails: makeThumbnails('public-video'),
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'public' as const, // Public → sent status
          liveBroadcastContent: 'none' as const,
        },
      ]

      // 2-phase flow
      mockListPlaylistItems.mockResolvedValue({ videoIds: ['public-video'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
      mockGetAllVideosRaw.mockResolvedValue([])
      mockBatchWriteVideos.mockResolvedValue(undefined)

      const result = await syncVideos('pptnc', 'access-token')

      expect(result.added).toBe(0)
      expect(result.addedAsSent).toBe(1)
      expect(mockBatchWriteVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.objectContaining({
          creates: expect.arrayContaining([
            expect.objectContaining({ status: 'sent', hasEmbedding: false }),
          ]),
        })
      )
    })

    it('reopens sent videos when visibility changes to non-public', async () => {
      // With delta sync, the sent video is already in Firestore so won't be in new videos
      // But we need to re-evaluate it via getVideoDetails

      const firestoreVideosRaw = [
        {
          id: 'sent-video',
          podcastId: 'pptnc',
          title: 'Previously Sent Video',
          status: 'sent',
          youtubePrivacyStatus: 'public', // Was public when sent
        },
      ]

      // Delta sync: sent-video exists, so it's skipped in Phase 1
      mockGetExistingVideoIds.mockResolvedValue(new Set(['sent-video']))
      mockListPlaylistItems.mockResolvedValue({ videoIds: ['sent-video'], nextPageToken: undefined })
      mockGetAllVideosRaw.mockResolvedValue(firestoreVideosRaw)
      mockBatchWriteVideos.mockResolvedValue(undefined)

      // getVideoDetails is called to re-evaluate sent videos (separate from 2-phase flow)
      mockGetVideoDetails.mockResolvedValue([
        {
          id: 'sent-video',
          title: 'Previously Sent Video',
          description: 'Description',
          thumbnails: makeThumbnails('sent-video'),
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'private' as const, // Changed from public to private
          liveBroadcastContent: 'none' as const,
        },
      ])

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

    // Note: Transcription tests removed per Story 5.6 (Transcrição On-Demand)
    // Transcriptions are now fetched on-demand when producer selects a video

    it('excludes live broadcasts from import', async () => {
      const youtubeVideos = [
        {
          id: 'regular-video',
          title: 'Regular Video',
          description: 'Description',
          thumbnails: makeThumbnails('regular-video'),
          duration: 3600,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'public' as const,
          liveBroadcastContent: 'none' as const, // Regular video → should be imported
        },
        {
          id: 'live-video',
          title: 'Live Stream',
          description: 'Description',
          thumbnails: makeThumbnails('live-video'),
          duration: 7200,
          publishedAt: '2024-01-15T00:00:00Z',
          privacyStatus: 'public' as const,
          liveBroadcastContent: 'live' as const, // Live broadcast → should be excluded
        },
        {
          id: 'upcoming-video',
          title: 'Upcoming Stream',
          description: 'Description',
          thumbnails: makeThumbnails('upcoming-video'),
          duration: 0,
          publishedAt: '2024-01-16T00:00:00Z',
          privacyStatus: 'private' as const,
          liveBroadcastContent: 'upcoming' as const, // Upcoming broadcast → should be excluded
        },
      ]

      // 2-phase flow: Phase 1 returns all IDs
      mockListPlaylistItems.mockResolvedValue({
        videoIds: ['regular-video', 'live-video', 'upcoming-video'],
        nextPageToken: undefined,
      })
      // Phase 2: returns all video details
      mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
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

    describe('Delta Sync (Story 7.1)', () => {
      it('uses getExistingVideoIds for delta sync', async () => {
        mockListPlaylistItems.mockResolvedValue({ videoIds: [], nextPageToken: undefined })
        mockGetAllVideosRaw.mockResolvedValue([])

        await syncVideos('pptnc', 'access-token')

        // Should call getExistingVideoIds for optimized delta sync
        expect(mockGetExistingVideoIds).toHaveBeenCalledWith('pptnc')
      })

      it('skips existing videos but continues fetching all pages', async () => {
        // Simulate: new videos interspersed with existing videos across pages
        const newVideosDetails = [
          {
            id: 'new-video-1',
            title: 'New Video 1',
            description: 'Description',
            thumbnails: makeThumbnails('new-video-1'),
            duration: 3600,
            publishedAt: '2024-01-15T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
          {
            id: 'new-video-2',
            title: 'New Video 2',
            description: 'Description',
            thumbnails: makeThumbnails('new-video-2'),
            duration: 3600,
            publishedAt: '2024-01-14T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
          {
            id: 'new-video-3',
            title: 'New Video 3',
            description: 'Description',
            thumbnails: makeThumbnails('new-video-3'),
            duration: 3600,
            publishedAt: '2024-01-10T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
        ]

        // Set up existing IDs (these will be skipped)
        mockGetExistingVideoIds.mockResolvedValue(new Set(['existing-video', 'older-existing']))

        // 2-phase flow: Phase 1 returns IDs across 2 pages, with existing mixed in
        mockListPlaylistItems
          .mockResolvedValueOnce({
            videoIds: ['new-video-1', 'new-video-2', 'existing-video'],
            nextPageToken: 'page2token',
          })
          .mockResolvedValueOnce({
            videoIds: ['older-existing', 'new-video-3'],
            nextPageToken: undefined,
          })
        // Phase 2: only gets called with the 3 new IDs (existing ones skipped)
        mockGetVideoDetailsBatch.mockResolvedValue(newVideosDetails)
        mockGetAllVideosRaw.mockResolvedValue([])
        mockBatchWriteVideos.mockResolvedValue(undefined)

        const result = await syncVideos('pptnc', 'access-token')

        // Should add all 3 new videos (skipping existing ones)
        expect(result.added).toBe(3)
        expect(result.newVideos).toBe(3)
        // Should fetch ALL pages (no early exit)
        expect(mockListPlaylistItems).toHaveBeenCalledTimes(2)
        // getVideoDetailsBatch called with only new IDs
        expect(mockGetVideoDetailsBatch).toHaveBeenCalledWith(['new-video-1', 'new-video-2', 'new-video-3'])
      })

      it('fetches all pages even when existing videos are encountered', async () => {
        const allVideos = [
          {
            id: 'video-1',
            title: 'Video 1',
            description: 'Description',
            thumbnails: makeThumbnails('video-1'),
            duration: 3600,
            publishedAt: '2024-01-15T00:00:00Z',
            privacyStatus: 'public' as const,
            liveBroadcastContent: 'none' as const,
          },
          {
            id: 'video-2',
            title: 'Video 2',
            description: 'Description',
            thumbnails: makeThumbnails('video-2'),
            duration: 3600,
            publishedAt: '2024-01-14T00:00:00Z',
            privacyStatus: 'public' as const,
            liveBroadcastContent: 'none' as const,
          },
        ]

        // Some existing videos
        mockGetExistingVideoIds.mockResolvedValue(new Set(['existing-in-page-1']))

        // 2-phase flow: Phase 1 paginates through all pages
        mockListPlaylistItems
          .mockResolvedValueOnce({ videoIds: ['video-1', 'existing-in-page-1'], nextPageToken: 'page2token' })
          .mockResolvedValueOnce({ videoIds: ['video-2'], nextPageToken: undefined })
        // Phase 2: gets only new IDs
        mockGetVideoDetailsBatch.mockResolvedValue(allVideos)
        mockGetAllVideosRaw.mockResolvedValue([])
        mockBatchWriteVideos.mockResolvedValue(undefined)

        const result = await syncVideos('pptnc', 'access-token')

        // Should fetch all pages (existing videos are skipped, not early exit)
        expect(mockListPlaylistItems).toHaveBeenCalledTimes(2)
        expect(result.newVideos).toBe(2)
      })

      it('reports skipped count based on existing videos', async () => {
        // Existing videos = skipped count
        mockGetExistingVideoIds.mockResolvedValue(new Set(['video-1', 'video-2', 'video-3']))

        // All videos in the page are existing
        mockListPlaylistItems.mockResolvedValue({ videoIds: ['video-1'], nextPageToken: undefined })
        mockGetAllVideosRaw.mockResolvedValue([])

        const result = await syncVideos('pptnc', 'access-token')

        // Skipped should reflect existing videos count
        expect(result.skipped).toBe(3)
      })
    })

    describe('2-Phase Optimized Flow (Story 7.2)', () => {
      it('calls listPlaylistItems for Phase 1 (ID collection)', async () => {
        mockListPlaylistItems.mockResolvedValue({ videoIds: [], nextPageToken: undefined })
        mockGetAllVideosRaw.mockResolvedValue([])

        await syncVideos('pptnc', 'access-token')

        // Phase 1: Should call listPlaylistItems with uploads playlist ID
        expect(mockListPlaylistItems).toHaveBeenCalledWith(
          'UU123', // Converted from UC123
          50,
          undefined
        )
      })

      it('only fetches video details for new IDs (Phase 2)', async () => {
        const newVideoDetails = [
          {
            id: 'new-video',
            title: 'New Video',
            description: 'Description',
            thumbnails: makeThumbnails('new-video'),
            duration: 3600,
            publishedAt: '2024-01-15T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
        ]

        // 3 IDs returned from playlist, but 2 are existing
        mockGetExistingVideoIds.mockResolvedValue(new Set(['existing-1', 'existing-2']))
        mockListPlaylistItems.mockResolvedValue({
          videoIds: ['new-video', 'existing-1', 'existing-2'],
          nextPageToken: undefined,
        })
        mockGetVideoDetailsBatch.mockResolvedValue(newVideoDetails)
        mockGetAllVideosRaw.mockResolvedValue([])
        mockBatchWriteVideos.mockResolvedValue(undefined)

        await syncVideos('pptnc', 'access-token')

        // Phase 2: Should only call getVideoDetailsBatch with new ID
        expect(mockGetVideoDetailsBatch).toHaveBeenCalledWith(['new-video'])
        expect(mockGetVideoDetailsBatch).toHaveBeenCalledTimes(1)
      })

      it('does not call getVideoDetailsBatch when no new videos', async () => {
        // All videos are existing
        mockGetExistingVideoIds.mockResolvedValue(new Set(['existing-1', 'existing-2']))
        mockListPlaylistItems.mockResolvedValue({
          videoIds: ['existing-1'],
          nextPageToken: undefined,
        })
        mockGetAllVideosRaw.mockResolvedValue([])

        await syncVideos('pptnc', 'access-token')

        // Should NOT call getVideoDetailsBatch when no new IDs
        expect(mockGetVideoDetailsBatch).not.toHaveBeenCalled()
      })
    })

    describe('Parallel Thumbnail Upload (Story 7.3)', () => {
      it('uploads thumbnails for multiple new videos', async () => {
        const youtubeVideos = [
          {
            id: 'video-1',
            title: 'Video 1',
            description: 'Desc 1',
            thumbnails: makeThumbnails('video-1'),
            duration: 3600,
            publishedAt: '2024-01-15T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
          {
            id: 'video-2',
            title: 'Video 2',
            description: 'Desc 2',
            thumbnails: makeThumbnails('video-2'),
            duration: 3600,
            publishedAt: '2024-01-14T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
          {
            id: 'video-3',
            title: 'Video 3',
            description: 'Desc 3',
            thumbnails: makeThumbnails('video-3'),
            duration: 3600,
            publishedAt: '2024-01-13T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
        ]

        mockListPlaylistItems.mockResolvedValue({
          videoIds: ['video-1', 'video-2', 'video-3'],
          nextPageToken: undefined,
        })
        mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
        mockGetAllVideosRaw.mockResolvedValue([])
        mockBatchWriteVideos.mockResolvedValue(undefined)

        await syncVideos('pptnc', 'access-token')

        // Should upload thumbnail for each new video
        expect(mockUploadVideoThumbnail).toHaveBeenCalledTimes(3)
        expect(mockUploadVideoThumbnail).toHaveBeenCalledWith(
          'pptnc',
          'video-1',
          expect.arrayContaining([expect.stringContaining('video-1')])
        )
        expect(mockUploadVideoThumbnail).toHaveBeenCalledWith(
          'pptnc',
          'video-2',
          expect.arrayContaining([expect.stringContaining('video-2')])
        )
        expect(mockUploadVideoThumbnail).toHaveBeenCalledWith(
          'pptnc',
          'video-3',
          expect.arrayContaining([expect.stringContaining('video-3')])
        )
      })

      it('continues sync when thumbnail upload fails for one video', async () => {
        const youtubeVideos = [
          {
            id: 'video-ok',
            title: 'Video OK',
            description: 'Desc',
            thumbnails: makeThumbnails('video-ok'),
            duration: 3600,
            publishedAt: '2024-01-15T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
          {
            id: 'video-fail',
            title: 'Video Fail',
            description: 'Desc',
            thumbnails: makeThumbnails('video-fail'),
            duration: 3600,
            publishedAt: '2024-01-14T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
        ]

        mockListPlaylistItems.mockResolvedValue({
          videoIds: ['video-ok', 'video-fail'],
          nextPageToken: undefined,
        })
        mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
        mockGetAllVideosRaw.mockResolvedValue([])
        mockBatchWriteVideos.mockResolvedValue(undefined)

        // First upload succeeds, second fails
        mockUploadVideoThumbnail
          .mockResolvedValueOnce('https://storage.example.com/video-ok.jpg')
          .mockRejectedValueOnce(new Error('Network error'))

        // Sync should NOT throw
        const result = await syncVideos('pptnc', 'access-token')

        // Both videos should be created
        expect(result.added).toBe(2)
        expect(mockBatchWriteVideos).toHaveBeenCalledWith(
          'pptnc',
          expect.objectContaining({
            creates: expect.arrayContaining([
              expect.objectContaining({ id: 'video-ok' }),
              expect.objectContaining({ id: 'video-fail' }),
            ]),
          })
        )

        // Video with successful upload should have storageThumbnailUrl
        const createCall = mockBatchWriteVideos.mock.calls[0][1]
        const videoOk = createCall.creates.find((v: { id: string }) => v.id === 'video-ok')
        const videoFail = createCall.creates.find((v: { id: string }) => v.id === 'video-fail')

        expect(videoOk.storageThumbnailUrl).toBe('https://storage.example.com/video-ok.jpg')
        expect(videoFail.storageThumbnailUrl).toBeUndefined()
      })

      it('does not call uploadVideoThumbnail when no new videos', async () => {
        mockListPlaylistItems.mockResolvedValue({
          videoIds: [],
          nextPageToken: undefined,
        })
        mockGetAllVideosRaw.mockResolvedValue([])

        await syncVideos('pptnc', 'access-token')

        expect(mockUploadVideoThumbnail).not.toHaveBeenCalled()
      })

      it('handles exactly 5 videos (concurrency boundary)', async () => {
        // Create exactly 5 videos to match THUMBNAIL_UPLOAD_CONCURRENCY
        const videoIds = ['v1', 'v2', 'v3', 'v4', 'v5']
        const youtubeVideos = videoIds.map((id, i) => ({
          id,
          title: `Video ${i + 1}`,
          description: 'Desc',
          thumbnails: makeThumbnails(id),
          duration: 3600,
          publishedAt: `2024-01-${15 - i}T00:00:00Z`,
          privacyStatus: 'private' as const,
          liveBroadcastContent: 'none' as const,
        }))

        mockListPlaylistItems.mockResolvedValue({
          videoIds,
          nextPageToken: undefined,
        })
        mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
        mockGetAllVideosRaw.mockResolvedValue([])
        mockBatchWriteVideos.mockResolvedValue(undefined)

        const result = await syncVideos('pptnc', 'access-token')

        expect(result.added).toBe(5)
        expect(mockUploadVideoThumbnail).toHaveBeenCalledTimes(5)
      })

      it('handles more than 5 videos (exceeds concurrency limit)', async () => {
        // Create 8 videos to exceed THUMBNAIL_UPLOAD_CONCURRENCY (5)
        const videoIds = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8']
        const youtubeVideos = videoIds.map((id, i) => ({
          id,
          title: `Video ${i + 1}`,
          description: 'Desc',
          thumbnails: makeThumbnails(id),
          duration: 3600,
          publishedAt: `2024-01-${15 - i}T00:00:00Z`,
          privacyStatus: 'private' as const,
          liveBroadcastContent: 'none' as const,
        }))

        mockListPlaylistItems.mockResolvedValue({
          videoIds,
          nextPageToken: undefined,
        })
        mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
        mockGetAllVideosRaw.mockResolvedValue([])
        mockBatchWriteVideos.mockResolvedValue(undefined)

        const result = await syncVideos('pptnc', 'access-token')

        // All 8 videos should be created
        expect(result.added).toBe(8)
        expect(mockUploadVideoThumbnail).toHaveBeenCalledTimes(8)

        // Verify all videos were created with correct IDs (order preserved)
        const createCall = mockBatchWriteVideos.mock.calls[0][1]
        expect(createCall.creates).toHaveLength(8)
        videoIds.forEach((id, index) => {
          expect(createCall.creates[index].id).toBe(id)
        })
      })

      it('preserves result order regardless of upload completion order', async () => {
        const youtubeVideos = [
          {
            id: 'slow-video',
            title: 'Slow',
            description: 'Desc',
            thumbnails: makeThumbnails('slow-video'),
            duration: 3600,
            publishedAt: '2024-01-15T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
          {
            id: 'fast-video',
            title: 'Fast',
            description: 'Desc',
            thumbnails: makeThumbnails('fast-video'),
            duration: 3600,
            publishedAt: '2024-01-14T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
        ]

        mockListPlaylistItems.mockResolvedValue({
          videoIds: ['slow-video', 'fast-video'],
          nextPageToken: undefined,
        })
        mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
        mockGetAllVideosRaw.mockResolvedValue([])
        mockBatchWriteVideos.mockResolvedValue(undefined)

        // Simulate different upload times - first is slow, second is fast
        mockUploadVideoThumbnail
          .mockImplementationOnce(() => new Promise(resolve =>
            setTimeout(() => resolve('https://storage/slow.jpg'), 10)
          ))
          .mockImplementationOnce(() => Promise.resolve('https://storage/fast.jpg'))

        await syncVideos('pptnc', 'access-token')

        // Results should still be in original order (slow first, fast second)
        const createCall = mockBatchWriteVideos.mock.calls[0][1]
        expect(createCall.creates[0].id).toBe('slow-video')
        expect(createCall.creates[1].id).toBe('fast-video')
      })
    })

    describe('Embedding Integration (Epic 17)', () => {
      it('calls embedVideos after creating new videos', async () => {
        const youtubeVideos = [
          {
            id: 'new-video-1',
            title: 'New Video 1',
            description: 'Description 1',
            thumbnails: makeThumbnails('new-video-1'),
            duration: 3600,
            publishedAt: '2024-01-15T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
        ]

        mockListPlaylistItems.mockResolvedValue({ videoIds: ['new-video-1'], nextPageToken: undefined })
        mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
        mockGetAllVideosRaw.mockResolvedValue([])
        mockBatchWriteVideos.mockResolvedValue(undefined)
        mockEmbedVideos.mockResolvedValue({ succeeded: 1, failed: 0 })

        await syncVideos('pptnc', 'access-token')

        expect(mockEmbedVideos).toHaveBeenCalledWith(
          'pptnc',
          expect.arrayContaining([
            expect.objectContaining({
              videoId: 'new-video-1',
              title: 'New Video 1',
              description: 'Description 1',
            }),
          ])
        )
      })

      it('does not fail sync if embedVideos throws', async () => {
        const youtubeVideos = [
          {
            id: 'new-video-1',
            title: 'New Video 1',
            description: 'Description 1',
            thumbnails: makeThumbnails('new-video-1'),
            duration: 3600,
            publishedAt: '2024-01-15T00:00:00Z',
            privacyStatus: 'private' as const,
            liveBroadcastContent: 'none' as const,
          },
        ]

        mockListPlaylistItems.mockResolvedValue({ videoIds: ['new-video-1'], nextPageToken: undefined })
        mockGetVideoDetailsBatch.mockResolvedValue(youtubeVideos)
        mockGetAllVideosRaw.mockResolvedValue([])
        mockBatchWriteVideos.mockResolvedValue(undefined)
        mockEmbedVideos.mockRejectedValue(new Error('Vertex AI error'))

        // Should NOT throw
        const result = await syncVideos('pptnc', 'access-token')

        // Sync should complete successfully
        expect(result.added).toBe(1)
        expect(mockEmbedVideos).toHaveBeenCalled()
      })

      it('does not call embedVideos when no new videos', async () => {
        mockListPlaylistItems.mockResolvedValue({ videoIds: [], nextPageToken: undefined })
        mockGetAllVideosRaw.mockResolvedValue([])

        await syncVideos('pptnc', 'access-token')

        expect(mockEmbedVideos).not.toHaveBeenCalled()
      })
    })
  })
})
