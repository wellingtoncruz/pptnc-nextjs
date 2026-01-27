import { describe, it, expect } from 'vitest'

import {
  YouTubeVideoItemSchema,
  YouTubeVideosResponseSchema,
  YouTubePlaylistItemSchema,
  YouTubePlaylistItemsResponseSchema,
  YouTubeChannelItemSchema,
  YouTubeChannelsResponseSchema,
} from './youtube-api'

describe('YouTubeVideoItemSchema', () => {
  const validVideoItem = {
    id: 'dQw4w9WgXcQ',
    snippet: {
      title: 'Test Video Title',
      description: 'Video description here',
      publishedAt: '2024-01-15T10:00:00Z',
      channelId: 'UCxxxxxxxx',
      thumbnails: {
        medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' },
        high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
      },
    },
    contentDetails: {
      duration: 'PT1H23M45S',
    },
  }

  it('accepts valid video item', () => {
    const result = YouTubeVideoItemSchema.parse(validVideoItem)
    expect(result.id).toBe('dQw4w9WgXcQ')
    expect(result.snippet.title).toBe('Test Video Title')
    expect(result.contentDetails.duration).toBe('PT1H23M45S')
  })

  it('accepts video item with optional fields', () => {
    const itemWithOptional = {
      ...validVideoItem,
      kind: 'youtube#video',
      etag: 'abc123',
      snippet: {
        ...validVideoItem.snippet,
        channelTitle: 'Test Channel',
        tags: ['tag1', 'tag2'],
        categoryId: '22',
      },
      contentDetails: {
        ...validVideoItem.contentDetails,
        dimension: '2d',
        definition: 'hd',
      },
    }
    const result = YouTubeVideoItemSchema.parse(itemWithOptional)
    expect(result.kind).toBe('youtube#video')
    expect(result.snippet.tags).toEqual(['tag1', 'tag2'])
  })

  it('accepts video item with minimal thumbnails', () => {
    const minimalItem = {
      ...validVideoItem,
      snippet: {
        ...validVideoItem.snippet,
        thumbnails: {
          medium: { url: 'https://i.ytimg.com/vi/abc/mqdefault.jpg' },
        },
      },
    }
    const result = YouTubeVideoItemSchema.parse(minimalItem)
    expect(result.snippet.thumbnails.medium?.url).toBe('https://i.ytimg.com/vi/abc/mqdefault.jpg')
  })

  it('rejects video item without id', () => {
    const { id: _id, ...withoutId } = validVideoItem
    expect(() => YouTubeVideoItemSchema.parse(withoutId)).toThrow()
  })

  it('rejects video item without snippet', () => {
    const { snippet: _snippet, ...withoutSnippet } = validVideoItem
    expect(() => YouTubeVideoItemSchema.parse(withoutSnippet)).toThrow()
  })

  it('rejects video item without contentDetails', () => {
    const { contentDetails: _contentDetails, ...withoutContentDetails } = validVideoItem
    expect(() => YouTubeVideoItemSchema.parse(withoutContentDetails)).toThrow()
  })
})

describe('YouTubeVideosResponseSchema', () => {
  const validResponse = {
    items: [
      {
        id: 'video1',
        snippet: {
          title: 'Video 1',
          description: 'Description 1',
          publishedAt: '2024-01-01T00:00:00Z',
          channelId: 'channel1',
          thumbnails: {
            medium: { url: 'https://example.com/thumb1.jpg' },
          },
        },
        contentDetails: { duration: 'PT10M' },
      },
    ],
  }

  it('accepts valid videos response', () => {
    const result = YouTubeVideosResponseSchema.parse(validResponse)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('video1')
  })

  it('accepts response with pagination tokens', () => {
    const responseWithPagination = {
      ...validResponse,
      nextPageToken: 'abc123',
      prevPageToken: 'xyz789',
      pageInfo: {
        totalResults: 100,
        resultsPerPage: 50,
      },
    }
    const result = YouTubeVideosResponseSchema.parse(responseWithPagination)
    expect(result.nextPageToken).toBe('abc123')
    expect(result.pageInfo?.totalResults).toBe(100)
  })

  it('accepts empty items array', () => {
    const emptyResponse = { items: [] }
    const result = YouTubeVideosResponseSchema.parse(emptyResponse)
    expect(result.items).toHaveLength(0)
  })
})

describe('YouTubePlaylistItemSchema', () => {
  const validPlaylistItem = {
    id: 'playlist-item-id',
    snippet: {
      publishedAt: '2024-01-15T10:00:00Z',
      channelId: 'UCxxxxxxxx',
      title: 'Playlist Video Title',
      description: 'Video description',
      thumbnails: {
        medium: { url: 'https://i.ytimg.com/vi/abc/mqdefault.jpg' },
      },
      playlistId: 'PLxxxxxxxx',
      position: 0,
      resourceId: {
        kind: 'youtube#video',
        videoId: 'dQw4w9WgXcQ',
      },
    },
  }

  it('accepts valid playlist item', () => {
    const result = YouTubePlaylistItemSchema.parse(validPlaylistItem)
    expect(result.snippet.resourceId.videoId).toBe('dQw4w9WgXcQ')
    expect(result.snippet.playlistId).toBe('PLxxxxxxxx')
  })

  it('accepts playlist item with contentDetails', () => {
    const itemWithContentDetails = {
      ...validPlaylistItem,
      contentDetails: {
        videoId: 'dQw4w9WgXcQ',
        videoPublishedAt: '2024-01-01T00:00:00Z',
      },
    }
    const result = YouTubePlaylistItemSchema.parse(itemWithContentDetails)
    expect(result.contentDetails?.videoId).toBe('dQw4w9WgXcQ')
  })
})

describe('YouTubePlaylistItemsResponseSchema', () => {
  const validResponse = {
    items: [
      {
        id: 'item1',
        snippet: {
          publishedAt: '2024-01-01T00:00:00Z',
          channelId: 'channel1',
          title: 'Title',
          description: 'Desc',
          thumbnails: {},
          playlistId: 'playlist1',
          position: 0,
          resourceId: { kind: 'youtube#video', videoId: 'vid1' },
        },
      },
    ],
  }

  it('accepts valid playlist items response', () => {
    const result = YouTubePlaylistItemsResponseSchema.parse(validResponse)
    expect(result.items).toHaveLength(1)
  })

  it('accepts response with pagination', () => {
    const responseWithPagination = {
      ...validResponse,
      nextPageToken: 'next123',
    }
    const result = YouTubePlaylistItemsResponseSchema.parse(responseWithPagination)
    expect(result.nextPageToken).toBe('next123')
  })
})

describe('YouTubeChannelItemSchema', () => {
  const validChannelItem = {
    id: 'UCxxxxxxxx',
    contentDetails: {
      relatedPlaylists: {
        uploads: 'UUxxxxxxxx',
      },
    },
  }

  it('accepts valid channel item', () => {
    const result = YouTubeChannelItemSchema.parse(validChannelItem)
    expect(result.id).toBe('UCxxxxxxxx')
    expect(result.contentDetails.relatedPlaylists.uploads).toBe('UUxxxxxxxx')
  })

  it('accepts channel item with optional likes playlist', () => {
    const itemWithLikes = {
      ...validChannelItem,
      contentDetails: {
        relatedPlaylists: {
          uploads: 'UUxxxxxxxx',
          likes: 'LLxxxxxxxx',
        },
      },
    }
    const result = YouTubeChannelItemSchema.parse(itemWithLikes)
    expect(result.contentDetails.relatedPlaylists.likes).toBe('LLxxxxxxxx')
  })

  it('rejects channel item without uploads playlist', () => {
    const itemWithoutUploads = {
      id: 'UCxxxxxxxx',
      contentDetails: {
        relatedPlaylists: {},
      },
    }
    expect(() => YouTubeChannelItemSchema.parse(itemWithoutUploads)).toThrow()
  })
})

describe('YouTubeChannelsResponseSchema', () => {
  const validResponse = {
    items: [
      {
        id: 'UCxxxxxxxx',
        contentDetails: {
          relatedPlaylists: {
            uploads: 'UUxxxxxxxx',
          },
        },
      },
    ],
  }

  it('accepts valid channels response', () => {
    const result = YouTubeChannelsResponseSchema.parse(validResponse)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('UCxxxxxxxx')
  })

  it('accepts response with pageInfo', () => {
    const responseWithPageInfo = {
      ...validResponse,
      pageInfo: {
        totalResults: 1,
        resultsPerPage: 50,
      },
    }
    const result = YouTubeChannelsResponseSchema.parse(responseWithPageInfo)
    expect(result.pageInfo?.totalResults).toBe(1)
  })
})
