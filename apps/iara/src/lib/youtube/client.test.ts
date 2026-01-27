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
    it('returns video details with parsed duration', async () => {
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
        thumbnail: 'https://i.ytimg.com/vi/vid1/mqdefault.jpg',
        duration: 5400, // 1h30m in seconds
        publishedAt: '2024-01-01T10:00:00Z',
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
            },
          ],
        }),
      })

      const result = await client.listVideos()

      expect(result.videos).toHaveLength(1)
      expect(result.videos[0].title).toBe('Video 1')
      expect(result.videos[0].duration).toBe(600) // 10 minutes
      expect(mockFetch).toHaveBeenCalledTimes(3)
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
