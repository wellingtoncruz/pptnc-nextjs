import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { YouTubeAPIError, YouTubeClient } from './client'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

describe('YouTubeClient', () => {
  const accessToken = 'test-access-token'
  let client: YouTubeClient

  beforeEach(() => {
    client = new YouTubeClient(accessToken)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('creates client with access token', () => {
      const c = new YouTubeClient('my-token')
      expect(c).toBeInstanceOf(YouTubeClient)
    })
  })

  describe('getUploadsPlaylistId', () => {
    it('returns uploads playlist ID from channel', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'UCxxxxxxxxx',
              contentDetails: {
                relatedPlaylists: {
                  uploads: 'UUxxxxxxxxx',
                },
              },
            },
          ],
        }),
      })

      const result = await client.getUploadsPlaylistId()

      expect(result).toBe('UUxxxxxxxxx')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/youtube/v3/channels?mine=true&part=contentDetails',
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        })
      )
    })

    it('throws YOUTUBE_NOT_FOUND when no channel found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })

      await expect(client.getUploadsPlaylistId()).rejects.toThrow(YouTubeAPIError)

      // Reset and test again for the toMatchObject assertion
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })

      await expect(client.getUploadsPlaylistId()).rejects.toMatchObject({
        code: 'YOUTUBE_NOT_FOUND',
      })
    })
  })

  describe('listPlaylistItems', () => {
    it('returns video IDs from playlist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'PLitem1',
              snippet: {
                resourceId: { kind: 'youtube#video', videoId: 'vid1' },
                title: 'Video 1',
                description: '',
                thumbnails: {},
                publishedAt: '2024-01-01T00:00:00Z',
                channelId: 'UC1',
                playlistId: 'PL1',
                position: 0,
              },
            },
            {
              id: 'PLitem2',
              snippet: {
                resourceId: { kind: 'youtube#video', videoId: 'vid2' },
                title: 'Video 2',
                description: '',
                thumbnails: {},
                publishedAt: '2024-01-02T00:00:00Z',
                channelId: 'UC1',
                playlistId: 'PL1',
                position: 1,
              },
            },
          ],
          nextPageToken: 'nextToken123',
        }),
      })

      const result = await client.listPlaylistItems('UUxxxxxxxxx', 50)

      expect(result.videoIds).toEqual(['vid1', 'vid2'])
      expect(result.nextPageToken).toBe('nextToken123')
    })

    it('includes pageToken in request when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })

      await client.listPlaylistItems('UUxxxxxxxxx', 50, 'myPageToken')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('&pageToken=myPageToken'),
        expect.any(Object)
      )
    })
  })

  describe('getVideoDetails', () => {
    it('returns video details with parsed duration and privacy status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'vid1',
              snippet: {
                title: 'Test Video 1',
                description: 'Description 1',
                publishedAt: '2024-01-01T10:00:00Z',
                channelId: 'UC1',
                thumbnails: {
                  medium: { url: 'https://i.ytimg.com/vi/vid1/mqdefault.jpg' },
                },
              },
              contentDetails: { duration: 'PT1H30M' },
              status: { privacyStatus: 'public' },
            },
          ],
        }),
      })

      const result = await client.getVideoDetails(['vid1'])

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'vid1',
        title: 'Test Video 1',
        description: 'Description 1',
        thumbnails: {
          medium: { url: 'https://i.ytimg.com/vi/vid1/mqdefault.jpg' },
        },
        duration: 5400, // 1h30m in seconds
        publishedAt: '2024-01-01T10:00:00Z',
        privacyStatus: 'public',
      })
    })

    it('returns empty array when no video IDs provided', async () => {
      const result = await client.getVideoDetails([])
      expect(result).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('joins multiple video IDs with comma', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })

      await client.getVideoDetails(['vid1', 'vid2', 'vid3'])

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('id=vid1,vid2,vid3'),
        expect.any(Object)
      )
    })
  })

  describe('getVideoDetailsBatch', () => {
    const createVideoResponse = (id: string) => ({
      id,
      snippet: {
        title: `Video ${id}`,
        description: `Description ${id}`,
        publishedAt: '2024-01-01T10:00:00Z',
        channelId: 'UC1',
        thumbnails: {
          medium: { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` },
        },
      },
      contentDetails: { duration: 'PT10M' },
      status: { privacyStatus: 'public' },
    })

    it('returns empty array for empty input', async () => {
      const result = await client.getVideoDetailsBatch([])
      expect(result).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('uses single request for <= 50 IDs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [createVideoResponse('vid1'), createVideoResponse('vid2')],
        }),
      })

      const result = await client.getVideoDetailsBatch(['vid1', 'vid2'])

      expect(result).toHaveLength(2)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('chunks > 50 IDs into multiple requests', async () => {
      // Create 75 video IDs
      const videoIds = Array.from({ length: 75 }, (_, i) => `vid${i}`)

      // Mock first batch (50 IDs)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: videoIds.slice(0, 50).map(createVideoResponse),
        }),
      })

      // Mock second batch (25 IDs)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: videoIds.slice(50, 75).map(createVideoResponse),
        }),
      })

      const result = await client.getVideoDetailsBatch(videoIds)

      expect(result).toHaveLength(75)
      expect(mockFetch).toHaveBeenCalledTimes(2)

      // Verify first call has 50 IDs
      const firstCall = mockFetch.mock.calls[0][0] as string
      const firstIds = firstCall.split('id=')[1].split('&')[0].split(',')
      expect(firstIds).toHaveLength(50)

      // Verify second call has 25 IDs
      const secondCall = mockFetch.mock.calls[1][0] as string
      const secondIds = secondCall.split('id=')[1].split('&')[0].split(',')
      expect(secondIds).toHaveLength(25)
    })

    it('processes exactly 50 IDs in single batch', async () => {
      const videoIds = Array.from({ length: 50 }, (_, i) => `vid${i}`)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: videoIds.map(createVideoResponse),
        }),
      })

      const result = await client.getVideoDetailsBatch(videoIds)

      expect(result).toHaveLength(50)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('handles 100 IDs (2 full batches)', async () => {
      const videoIds = Array.from({ length: 100 }, (_, i) => `vid${i}`)

      // Mock first batch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: videoIds.slice(0, 50).map(createVideoResponse),
        }),
      })

      // Mock second batch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: videoIds.slice(50, 100).map(createVideoResponse),
        }),
      })

      const result = await client.getVideoDetailsBatch(videoIds)

      expect(result).toHaveLength(100)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('listVideos', () => {
    it('orchestrates channel -> playlist -> videos calls', async () => {
      // Mock channels.list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'UCxxx',
              contentDetails: {
                relatedPlaylists: { uploads: 'UUxxx' },
              },
            },
          ],
        }),
      })

      // Mock playlistItems.list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'PLitem1',
              snippet: {
                resourceId: { kind: 'youtube#video', videoId: 'vid1' },
                title: 'V1',
                description: '',
                thumbnails: {},
                publishedAt: '2024-01-01T00:00:00Z',
                channelId: 'UC1',
                playlistId: 'PL1',
                position: 0,
              },
            },
          ],
        }),
      })

      // Mock videos.list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'vid1',
              snippet: {
                title: 'Video 1',
                description: 'Desc',
                publishedAt: '2024-01-01T10:00:00Z',
                channelId: 'UC1',
                thumbnails: {
                  medium: { url: 'https://example.com/thumb.jpg' },
                },
              },
              contentDetails: { duration: 'PT10M' },
              status: { privacyStatus: 'public' },
            },
          ],
        }),
      })

      const result = await client.listVideos({})

      expect(result.videos).toHaveLength(1)
      expect(result.videos[0].title).toBe('Video 1')
      expect(result.videos[0].duration).toBe(600) // 10 minutes
      expect(result.videos[0].privacyStatus).toBe('public')
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('uses channelId directly when provided (skips channels.list call)', async () => {
      // Mock playlistItems.list (no channels.list needed)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'PLitem1',
              snippet: {
                resourceId: { kind: 'youtube#video', videoId: 'vid1' },
                title: 'V1',
                description: '',
                thumbnails: {},
                publishedAt: '2024-01-01T00:00:00Z',
                channelId: 'UC1',
                playlistId: 'PL1',
                position: 0,
              },
            },
          ],
        }),
      })

      // Mock videos.list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'vid1',
              snippet: {
                title: 'Video 1',
                description: 'Desc',
                publishedAt: '2024-01-01T10:00:00Z',
                channelId: 'UC1',
                thumbnails: {
                  medium: { url: 'https://example.com/thumb.jpg' },
                },
              },
              contentDetails: { duration: 'PT10M' },
              status: { privacyStatus: 'unlisted' },
            },
          ],
        }),
      })

      const result = await client.listVideos({ channelId: 'UCOvTsuQyJq-fpydse7BY2PQ' })

      expect(result.videos).toHaveLength(1)
      expect(result.videos[0].title).toBe('Video 1')
      expect(result.videos[0].privacyStatus).toBe('unlisted')
      // Only 2 calls: playlistItems + videos (no channels.list)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      // First call should use the converted uploads playlist ID
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('playlistId=UUOvTsuQyJq-fpydse7BY2PQ'),
        expect.any(Object)
      )
    })
  })

  describe('channelIdToUploadsPlaylist', () => {
    it('converts UC channel ID to UU uploads playlist ID', () => {
      const result = YouTubeClient.channelIdToUploadsPlaylist('UCOvTsuQyJq-fpydse7BY2PQ')
      expect(result).toBe('UUOvTsuQyJq-fpydse7BY2PQ')
    })

    it('throws error for invalid channel ID format', () => {
      expect(() => YouTubeClient.channelIdToUploadsPlaylist('invalid-id')).toThrow(YouTubeAPIError)
      expect(() => YouTubeClient.channelIdToUploadsPlaylist('invalid-id')).toThrow(
        'Invalid channel ID format: invalid-id. Expected to start with "UC"'
      )
    })

    it('throws error for UU playlist ID (already converted)', () => {
      expect(() => YouTubeClient.channelIdToUploadsPlaylist('UUOvTsuQyJq-fpydse7BY2PQ')).toThrow(
        'Invalid channel ID format'
      )
    })
  })

  describe('uploadThumbnail (Epic 22, Story 22.5)', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    it('POSTs to thumbnails/set with the image MIME as Content-Type and binary body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      await client.uploadThumbnail('video-1', png, 'image/png')

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toContain('upload/youtube/v3/thumbnails/set?videoId=video-1')
      expect(url).toContain('uploadType=media')
      expect(init.method).toBe('POST')
      expect(init.headers['Content-Type']).toBe('image/png')
      expect(init.headers.Authorization).toBe('Bearer test-access-token')
      expect(init.body).toBeInstanceOf(Uint8Array)
    })

    it('rejects empty buffer before hitting the network', async () => {
      await expect(client.uploadThumbnail('video-1', Buffer.alloc(0), 'image/png')).rejects.toThrow(
        /empty/i
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects buffers larger than 2 MB', async () => {
      const big = Buffer.alloc(2 * 1024 * 1024 + 1)
      await expect(client.uploadThumbnail('video-1', big, 'image/png')).rejects.toThrow(
        /too large/i
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('rejects unsupported MIME types', async () => {
      await expect(
        client.uploadThumbnail('video-1', png, 'image/webp' as never)
      ).rejects.toThrow(/Invalid thumbnail MIME/)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('throws YouTubeAPIError on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { errors: [{ reason: 'forbidden' }] } }),
      })
      await expect(client.uploadThumbnail('video-1', png, 'image/png')).rejects.toMatchObject({
        code: 'YOUTUBE_FORBIDDEN',
      })
    })
  })

  describe('error handling', () => {
    it('throws YOUTUBE_QUOTA on 403 quotaExceeded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            errors: [{ reason: 'quotaExceeded' }],
          },
        }),
      })

      await expect(client.getUploadsPlaylistId()).rejects.toMatchObject({
        code: 'YOUTUBE_QUOTA',
        status: 403,
      })
    })

    it('throws YOUTUBE_FORBIDDEN on 403 without quotaExceeded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            errors: [{ reason: 'forbidden' }],
          },
        }),
      })

      await expect(client.getUploadsPlaylistId()).rejects.toMatchObject({
        code: 'YOUTUBE_FORBIDDEN',
        status: 403,
      })
    })

    it('throws YOUTUBE_NOT_FOUND on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
      })

      await expect(client.getUploadsPlaylistId()).rejects.toMatchObject({
        code: 'YOUTUBE_NOT_FOUND',
        status: 404,
      })
    })

    it('throws YOUTUBE_ERROR on other status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      })

      await expect(client.getUploadsPlaylistId()).rejects.toMatchObject({
        code: 'YOUTUBE_ERROR',
        status: 500,
      })
    })

    it('throws YOUTUBE_INVALID_RESPONSE on Zod validation failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // Missing required 'items' field
          invalid: 'response',
        }),
      })

      await expect(client.getUploadsPlaylistId()).rejects.toMatchObject({
        code: 'YOUTUBE_INVALID_RESPONSE',
      })
    })
  })

  describe('retry behavior', () => {
    it('retries on network error up to 3 times', async () => {
      const networkError = new Error('Network failure')

      mockFetch
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: 'UCxxx',
                contentDetails: {
                  relatedPlaylists: { uploads: 'UUxxx' },
                },
              },
            ],
          }),
        })

      const result = await client.getUploadsPlaylistId()

      expect(result).toBe('UUxxx')
      expect(mockFetch).toHaveBeenCalledTimes(3)
    }, 15000) // Increased timeout for retry delays

    it('throws after max retries exceeded', async () => {
      const networkError = new Error('Network failure')

      mockFetch
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)

      await expect(client.getUploadsPlaylistId()).rejects.toThrow('Network failure')
      expect(mockFetch).toHaveBeenCalledTimes(3)
    }, 15000)

    it('does not retry on YouTubeAPIError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { errors: [{ reason: 'quotaExceeded' }] },
        }),
      })

      await expect(client.getUploadsPlaylistId()).rejects.toMatchObject({
        code: 'YOUTUBE_QUOTA',
      })
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('listCaptions', () => {
    it('returns caption tracks for a video', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'caption-1',
              snippet: {
                videoId: 'vid1',
                language: 'pt-BR',
                trackKind: 'ASR',
                name: '',
              },
            },
            {
              id: 'caption-2',
              snippet: {
                videoId: 'vid1',
                language: 'en',
                trackKind: 'standard',
                name: 'English',
              },
            },
          ],
        }),
      })

      const result = await client.listCaptions('vid1')

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        id: 'caption-1',
        language: 'pt-BR',
        trackKind: 'ASR',
      })
      expect(result[1]).toMatchObject({
        id: 'caption-2',
        language: 'en',
        trackKind: 'standard',
      })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/captions?part=snippet&videoId=vid1'),
        expect.any(Object)
      )
    })

    it('returns empty array when video has no captions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })

      const result = await client.listCaptions('vid1')

      expect(result).toEqual([])
    })
  })

  describe('downloadCaption', () => {
    it('downloads SRT content by caption ID', async () => {
      const srtContent = `1
00:00:00,000 --> 00:00:02,500
Hello world`

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => srtContent,
      })

      const result = await client.downloadCaption('caption-1')

      expect(result).toBe(srtContent)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/youtube/v3/captions/caption-1?tfmt=srt',
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
      )
    })

    it('throws error on download failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { errors: [{ reason: 'forbidden' }] },
        }),
      })

      await expect(client.downloadCaption('caption-1')).rejects.toMatchObject({
        code: 'YOUTUBE_FORBIDDEN',
      })
    })
  })

  describe('downloadPortugueseCaptions', () => {
    it('prioritizes pt-BR ASR captions over pt', async () => {
      // Mock listCaptions
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'caption-pt',
              snippet: {
                videoId: 'vid1',
                language: 'pt',
                trackKind: 'ASR',
              },
            },
            {
              id: 'caption-pt-br',
              snippet: {
                videoId: 'vid1',
                language: 'pt-BR',
                trackKind: 'ASR',
              },
            },
          ],
        }),
      })

      // Mock downloadCaption
      const srtContent = `1
00:00:00,000 --> 00:00:02,500
Olá mundo`

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => srtContent,
      })

      const result = await client.downloadPortugueseCaptions('vid1')

      expect(result).toBe(srtContent)
      // Should download pt-BR, not pt
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('captions/caption-pt-br'),
        expect.any(Object)
      )
    })

    it('falls back to pt when pt-BR not available', async () => {
      // Mock listCaptions - only pt available
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'caption-pt',
              snippet: {
                videoId: 'vid1',
                language: 'pt',
                trackKind: 'ASR',
              },
            },
          ],
        }),
      })

      // Mock downloadCaption
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'SRT content',
      })

      const result = await client.downloadPortugueseCaptions('vid1')

      expect(result).toBe('SRT content')
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('captions/caption-pt'),
        expect.any(Object)
      )
    })

    it('returns null when no Portuguese ASR captions available', async () => {
      // Mock listCaptions - only English available
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'caption-en',
              snippet: {
                videoId: 'vid1',
                language: 'en',
                trackKind: 'ASR',
              },
            },
          ],
        }),
      })

      const result = await client.downloadPortugueseCaptions('vid1')

      expect(result).toBeNull()
      // Should only call listCaptions, not downloadCaption
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('ignores non-ASR Portuguese captions', async () => {
      // Mock listCaptions - Portuguese but not ASR
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: 'caption-pt',
              snippet: {
                videoId: 'vid1',
                language: 'pt-BR',
                trackKind: 'standard', // Not ASR
              },
            },
          ],
        }),
      })

      const result = await client.downloadPortugueseCaptions('vid1')

      expect(result).toBeNull()
    })

    it('returns null when video has no captions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })

      const result = await client.downloadPortugueseCaptions('vid1')

      expect(result).toBeNull()
    })
  })
})

describe('YouTubeAPIError', () => {
  it('creates error with code and message', () => {
    const error = new YouTubeAPIError('YOUTUBE_QUOTA', 'Quota exceeded', 403)

    expect(error.code).toBe('YOUTUBE_QUOTA')
    expect(error.message).toBe('Quota exceeded')
    expect(error.status).toBe(403)
    expect(error.name).toBe('YouTubeAPIError')
  })

  it('creates error without status', () => {
    const error = new YouTubeAPIError('YOUTUBE_ERROR', 'Unknown error')

    expect(error.status).toBeUndefined()
  })
})
