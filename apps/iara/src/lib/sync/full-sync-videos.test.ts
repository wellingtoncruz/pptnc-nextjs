import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock firebase-admin/firestore
const mockBatchSet = vi.fn()
const mockBatchUpdate = vi.fn()
const mockBatchCommit = vi.fn().mockResolvedValue(undefined)
const mockBatchFn = vi.fn(() => ({
  set: mockBatchSet,
  update: mockBatchUpdate,
  commit: mockBatchCommit,
}))

const mockLockGet = vi.fn()
const mockLockSet = vi.fn().mockResolvedValue(undefined)

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromDate: (date: Date) => ({ toDate: () => date, _seconds: Math.floor(date.getTime() / 1000) }),
    now: () => ({ toDate: () => new Date(), _seconds: Math.floor(Date.now() / 1000) }),
  },
  FieldValue: {
    serverTimestamp: () => 'SERVER_TIMESTAMP',
  },
}))

// Mock admin DB
vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: () => ({
    batch: mockBatchFn,
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            get: mockLockGet,
            set: mockLockSet,
          }),
        }),
      }),
    }),
  }),
}))

// Mock videos-admin
vi.mock('@/lib/firebase/videos-admin', () => ({
  getAllVideosRaw: vi.fn(),
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
  classifyVideoType: vi.fn().mockReturnValue('episode'),
}))

// Mock YouTube client
let mockListPlaylistItems: ReturnType<typeof vi.fn>
let mockGetVideoDetailsBatch: ReturnType<typeof vi.fn>

vi.mock('@/lib/youtube', () => ({
  YouTubeClient: class MockYouTubeClient {
    constructor(_accessToken: string) {}
    listPlaylistItems(...args: unknown[]) {
      return mockListPlaylistItems(...args)
    }
    getVideoDetailsBatch(...args: unknown[]) {
      return mockGetVideoDetailsBatch(...args)
    }
    static channelIdToUploadsPlaylist(channelId: string) {
      return 'UU' + channelId.substring(2)
    }
  },
}))

// Mock embedding service
vi.mock('@/lib/embedding/video-embedding', () => ({
  embedVideos: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
}))

// Mock sync-videos (youtubeToVideoCreate)
vi.mock('@/lib/sync/sync-videos', () => ({
  youtubeToVideoCreate: vi.fn(
    (ytVideo: { id: string; title: string; description?: string; thumbnails: unknown; duration: number; publishedAt: string; privacyStatus: string }, podcastId: string, videoType: string) => ({
      id: ytVideo.id,
      podcastId,
      title: ytVideo.title,
      description: ytVideo.description,
      thumbnails: ytVideo.thumbnails,
      duration: ytVideo.duration,
      publishedAt: { _seconds: Math.floor(new Date(ytVideo.publishedAt).getTime() / 1000) },
      status: ytVideo.privacyStatus === 'public' ? 'sent' : 'new',
      videoType,
      youtubePrivacyStatus: ytVideo.privacyStatus,
      visibilityUpdatedAt: { _seconds: Math.floor(Date.now() / 1000) },
      hasEmbedding: false,
    })
  ),
}))

import { getAllVideosRaw } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { classifyVideoType } from '@/lib/video-utils'
import { youtubeToVideoCreate } from '@/lib/sync/sync-videos'
import { embedVideos } from '@/lib/embedding/video-embedding'

import { fullSyncVideos } from './full-sync-videos'

const mockGetAllVideosRaw = vi.mocked(getAllVideosRaw)
const mockGetPodcastAdmin = vi.mocked(getPodcastAdmin)
const mockClassifyVideoType = vi.mocked(classifyVideoType)
const mockYoutubeToVideoCreate = vi.mocked(youtubeToVideoCreate)
const mockEmbedVideos = vi.mocked(embedVideos)

function makeThumbnails(videoId: string) {
  return {
    high: { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, width: 480, height: 360 },
  }
}

describe('full-sync-videos.ts', () => {
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
    mockListPlaylistItems = vi.fn()
    mockGetVideoDetailsBatch = vi.fn().mockResolvedValue([])
    mockGetPodcastAdmin.mockResolvedValue(mockPodcast as never)
    mockClassifyVideoType.mockReturnValue('episode')
    // Lock: not in progress
    mockLockGet.mockResolvedValue({ exists: false })
    mockEmbedVideos.mockResolvedValue({ succeeded: 0, failed: 0 })
  })

  describe('fullSyncVideos — new video creation', () => {
    it('uses youtubeToVideoCreate for new videos', async () => {
      const ytVideo = {
        id: 'new-video-1',
        title: 'New Video',
        description: 'Description',
        thumbnails: makeThumbnails('new-video-1'),
        duration: 3600,
        publishedAt: '2024-01-15T00:00:00Z',
        privacyStatus: 'public' as const,
        liveBroadcastContent: 'none' as const,
      }

      mockListPlaylistItems.mockResolvedValue({ videoIds: ['new-video-1'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue([ytVideo])
      mockGetAllVideosRaw.mockResolvedValue([])

      await fullSyncVideos('pptnc', 'access-token', 'user-123')

      // Should call youtubeToVideoCreate (not build inline)
      expect(mockYoutubeToVideoCreate).toHaveBeenCalledWith(
        ytVideo,
        'pptnc',
        'episode'
      )

      // batch.set should spread the result + add timestamps
      expect(mockBatchSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 'new-video-1',
          podcastId: 'pptnc',
          hasEmbedding: false,
          createdAt: 'SERVER_TIMESTAMP',
          updatedAt: 'SERVER_TIMESTAMP',
        })
      )
    })

    it('adds createdAt and updatedAt with FieldValue.serverTimestamp()', async () => {
      const ytVideo = {
        id: 'new-video',
        title: 'New',
        description: 'Desc',
        thumbnails: makeThumbnails('new-video'),
        duration: 3600,
        publishedAt: '2024-01-15T00:00:00Z',
        privacyStatus: 'private' as const,
        liveBroadcastContent: 'none' as const,
      }

      mockListPlaylistItems.mockResolvedValue({ videoIds: ['new-video'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue([ytVideo])
      mockGetAllVideosRaw.mockResolvedValue([])

      await fullSyncVideos('pptnc', 'access-token', 'user-123')

      const setCall = mockBatchSet.mock.calls[0][1]
      expect(setCall.createdAt).toBe('SERVER_TIMESTAMP')
      expect(setCall.updatedAt).toBe('SERVER_TIMESTAMP')
    })

    it('returns correct counts for new videos', async () => {
      const ytVideo = {
        id: 'new-video-1',
        title: 'New Video',
        description: 'Desc',
        thumbnails: makeThumbnails('new-video-1'),
        duration: 3600,
        publishedAt: '2024-01-15T00:00:00Z',
        privacyStatus: 'public' as const,
        liveBroadcastContent: 'none' as const,
      }

      mockListPlaylistItems.mockResolvedValue({ videoIds: ['new-video-1'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue([ytVideo])
      mockGetAllVideosRaw.mockResolvedValue([])

      const result = await fullSyncVideos('pptnc', 'access-token', 'user-123')

      expect(result.added).toBe(1)
      expect(result.total).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.unchanged).toBe(0)
    })
  })

  describe('fullSyncVideos — existing video updates', () => {
    it('updates existing video when metadata changed', async () => {
      const ytVideo = {
        id: 'existing-video',
        title: 'Updated Title',
        description: 'Updated Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg', width: 480, height: 360 } },
        duration: 3600,
        publishedAt: '2024-01-15T00:00:00Z',
        privacyStatus: 'public' as const,
        liveBroadcastContent: 'none' as const,
      }

      const firestoreVideo = {
        id: 'existing-video',
        title: 'Old Title', // Different — triggers update
        description: 'Old Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg' } },
        duration: 3600,
        youtubePrivacyStatus: 'public',
      }

      mockListPlaylistItems.mockResolvedValue({ videoIds: ['existing-video'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue([ytVideo])
      mockGetAllVideosRaw.mockResolvedValue([firestoreVideo])

      const result = await fullSyncVideos('pptnc', 'access-token', 'user-123')

      expect(result.updated).toBe(1)
      expect(result.added).toBe(0)
      expect(result.unchanged).toBe(0)
      expect(mockBatchUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: 'Updated Title',
          description: 'Updated Desc',
        })
      )
      // Should NOT call youtubeToVideoCreate for updates
      expect(mockYoutubeToVideoCreate).not.toHaveBeenCalled()
    })

    it('skips existing video when metadata unchanged', async () => {
      const ytVideo = {
        id: 'existing-video',
        title: 'Same Title',
        description: 'Same Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg', width: 480, height: 360 } },
        duration: 3600,
        publishedAt: '2024-01-15T00:00:00Z',
        privacyStatus: 'public' as const,
        liveBroadcastContent: 'none' as const,
      }

      const firestoreVideo = {
        id: 'existing-video',
        title: 'Same Title',
        description: 'Same Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg' } },
        duration: 3600,
        youtubePrivacyStatus: 'public',
      }

      mockListPlaylistItems.mockResolvedValue({ videoIds: ['existing-video'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue([ytVideo])
      mockGetAllVideosRaw.mockResolvedValue([firestoreVideo])

      const result = await fullSyncVideos('pptnc', 'access-token', 'user-123')

      expect(result.unchanged).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.added).toBe(0)
      expect(mockBatchSet).not.toHaveBeenCalled()
      expect(mockBatchUpdate).not.toHaveBeenCalled()
    })
  })

  describe('fullSyncVideos — embedding integration (Epic 17)', () => {
    it('calls embedVideos for new videos after batch commits', async () => {
      const ytVideo = {
        id: 'new-video-1',
        title: 'New Video',
        description: 'Description',
        thumbnails: makeThumbnails('new-video-1'),
        duration: 3600,
        publishedAt: '2024-01-15T00:00:00Z',
        privacyStatus: 'public' as const,
        liveBroadcastContent: 'none' as const,
      }

      mockListPlaylistItems.mockResolvedValue({ videoIds: ['new-video-1'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue([ytVideo])
      mockGetAllVideosRaw.mockResolvedValue([])
      mockEmbedVideos.mockResolvedValue({ succeeded: 1, failed: 0 })

      await fullSyncVideos('pptnc', 'access-token', 'user-123')

      expect(mockEmbedVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.arrayContaining([
          expect.objectContaining({
            videoId: 'new-video-1',
            title: 'New Video',
            description: 'Description',
          }),
        ])
      )
    })

    it('does not fail full sync if embedVideos throws', async () => {
      const ytVideo = {
        id: 'new-video-1',
        title: 'New Video',
        description: 'Desc',
        thumbnails: makeThumbnails('new-video-1'),
        duration: 3600,
        publishedAt: '2024-01-15T00:00:00Z',
        privacyStatus: 'public' as const,
        liveBroadcastContent: 'none' as const,
      }

      mockListPlaylistItems.mockResolvedValue({ videoIds: ['new-video-1'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue([ytVideo])
      mockGetAllVideosRaw.mockResolvedValue([])
      mockEmbedVideos.mockRejectedValue(new Error('Vertex AI error'))

      // Should NOT throw
      const result = await fullSyncVideos('pptnc', 'access-token', 'user-123')

      expect(result.added).toBe(1)
      expect(mockEmbedVideos).toHaveBeenCalled()
    })

    it('calls embedVideos for updated videos when title/description changed (Story 17.5)', async () => {
      const ytVideo = {
        id: 'existing-video',
        title: 'Updated Title',
        description: 'Updated Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg', width: 480, height: 360 } },
        duration: 3600,
        publishedAt: '2024-01-15T00:00:00Z',
        privacyStatus: 'public' as const,
        liveBroadcastContent: 'none' as const,
      }

      const firestoreVideo = {
        id: 'existing-video',
        title: 'Old Title',
        description: 'Old Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg' } },
        duration: 3600,
        youtubePrivacyStatus: 'public',
      }

      mockListPlaylistItems.mockResolvedValue({ videoIds: ['existing-video'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue([ytVideo])
      mockGetAllVideosRaw.mockResolvedValue([firestoreVideo])
      mockEmbedVideos.mockResolvedValue({ succeeded: 1, failed: 0 })

      await fullSyncVideos('pptnc', 'access-token', 'user-123')

      expect(mockEmbedVideos).toHaveBeenCalledWith(
        'pptnc',
        expect.arrayContaining([
          expect.objectContaining({
            videoId: 'existing-video',
            title: 'Updated Title',
            description: 'Updated Desc',
          }),
        ])
      )
    })

    it('does NOT call embedVideos for updated videos when only non-text fields changed (Story 17.5)', async () => {
      const ytVideo = {
        id: 'existing-video',
        title: 'Same Title',
        description: 'Same Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg', width: 480, height: 360 } },
        duration: 7200, // Duration changed — NOT an embedding field
        publishedAt: '2024-01-15T00:00:00Z',
        privacyStatus: 'public' as const,
        liveBroadcastContent: 'none' as const,
      }

      const firestoreVideo = {
        id: 'existing-video',
        title: 'Same Title',
        description: 'Same Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg' } },
        duration: 3600, // Different — triggers hasMetadataChanged but NOT embedding
        youtubePrivacyStatus: 'public',
      }

      mockListPlaylistItems.mockResolvedValue({ videoIds: ['existing-video'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue([ytVideo])
      mockGetAllVideosRaw.mockResolvedValue([firestoreVideo])

      await fullSyncVideos('pptnc', 'access-token', 'user-123')

      // Metadata was updated but title/description didn't change — no re-embed
      expect(mockBatchUpdate).toHaveBeenCalled()
      expect(mockEmbedVideos).not.toHaveBeenCalled()
    })

    it('does not fail full sync if embedVideos for updated videos throws (Story 17.5)', async () => {
      const ytVideo = {
        id: 'existing-video',
        title: 'New Title',
        description: 'Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg', width: 480, height: 360 } },
        duration: 3600,
        publishedAt: '2024-01-15T00:00:00Z',
        privacyStatus: 'public' as const,
        liveBroadcastContent: 'none' as const,
      }

      const firestoreVideo = {
        id: 'existing-video',
        title: 'Old Title',
        description: 'Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg' } },
        duration: 3600,
        youtubePrivacyStatus: 'public',
      }

      mockListPlaylistItems.mockResolvedValue({ videoIds: ['existing-video'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue([ytVideo])
      mockGetAllVideosRaw.mockResolvedValue([firestoreVideo])
      mockEmbedVideos.mockRejectedValue(new Error('Vertex AI error'))

      // Should NOT throw
      const result = await fullSyncVideos('pptnc', 'access-token', 'user-123')

      expect(result.updated).toBe(1)
      expect(mockEmbedVideos).toHaveBeenCalled()
    })

    it('does not call embedVideos when no new videos', async () => {
      const ytVideo = {
        id: 'existing-video',
        title: 'Same Title',
        description: 'Same Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg', width: 480, height: 360 } },
        duration: 3600,
        publishedAt: '2024-01-15T00:00:00Z',
        privacyStatus: 'public' as const,
        liveBroadcastContent: 'none' as const,
      }

      const firestoreVideo = {
        id: 'existing-video',
        title: 'Same Title',
        description: 'Same Desc',
        thumbnails: { high: { url: 'https://i.ytimg.com/vi/existing-video/hqdefault.jpg' } },
        duration: 3600,
        youtubePrivacyStatus: 'public',
      }

      mockListPlaylistItems.mockResolvedValue({ videoIds: ['existing-video'], nextPageToken: undefined })
      mockGetVideoDetailsBatch.mockResolvedValue([ytVideo])
      mockGetAllVideosRaw.mockResolvedValue([firestoreVideo])

      await fullSyncVideos('pptnc', 'access-token', 'user-123')

      expect(mockEmbedVideos).not.toHaveBeenCalled()
    })
  })
})
