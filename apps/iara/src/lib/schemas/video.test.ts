import { describe, it, expect } from 'vitest'

import {
  VideoSchema,
  VideoCreateSchema,
  VideoUpdateSchema,
  VideoTypeSchema,
  VideoStatusSchema,
  ChapterSchema,
  ComplianceSchema,
  ComplianceItemSchema,
  VideoSummarySchema,
  ThumbnailsSchema,
  StatisticsSchema,
} from './video'

// Helper to create a valid Firestore-like Timestamp
function createMockTimestamp(): { toDate: () => Date } {
  return {
    toDate: () => new Date(),
  }
}

describe('VideoStatusSchema', () => {
  it('accepts valid status values', () => {
    const validStatuses = ['new', 'processing', 'draft', 'ready', 'sending', 'sent']
    validStatuses.forEach((status) => {
      expect(VideoStatusSchema.parse(status)).toBe(status)
    })
  })

  it('rejects invalid status values', () => {
    expect(() => VideoStatusSchema.parse('invalid')).toThrow()
    expect(() => VideoStatusSchema.parse('')).toThrow()
    expect(() => VideoStatusSchema.parse(123)).toThrow()
  })
})

describe('VideoTypeSchema', () => {
  it('accepts valid video types', () => {
    const validTypes = ['episode', 'cut', 'reel']
    validTypes.forEach((type) => {
      expect(VideoTypeSchema.parse(type)).toBe(type)
    })
  })

  it('rejects invalid video types', () => {
    expect(() => VideoTypeSchema.parse('invalid')).toThrow()
    expect(() => VideoTypeSchema.parse('short')).toThrow()
  })
})

describe('ChapterSchema', () => {
  it('accepts valid chapter', () => {
    const chapter = { title: 'Introduction', timestamp: 0 }
    expect(ChapterSchema.parse(chapter)).toEqual(chapter)
  })

  it('rejects chapter with empty title', () => {
    expect(() => ChapterSchema.parse({ title: '', timestamp: 0 })).toThrow()
  })

  it('rejects chapter with negative timestamp', () => {
    expect(() => ChapterSchema.parse({ title: 'Test', timestamp: -1 })).toThrow()
  })
})

describe('ComplianceItemSchema', () => {
  it('accepts valid compliance item', () => {
    const item = {
      risk: 'Potential copyright issue',
      argument: 'Music playing in background',
      timestamp: 120,
    }
    expect(ComplianceItemSchema.parse(item)).toEqual(item)
  })

  it('rejects item with missing fields', () => {
    expect(() => ComplianceItemSchema.parse({ risk: 'Test' })).toThrow()
    expect(() => ComplianceItemSchema.parse({ argument: 'Test' })).toThrow()
  })
})

describe('ComplianceSchema', () => {
  it('accepts compliance with ok status', () => {
    const compliance = { status: 'ok', items: [] }
    expect(ComplianceSchema.parse(compliance)).toEqual(compliance)
  })

  it('accepts compliance with warning status and items', () => {
    const compliance = {
      status: 'warning',
      items: [{ risk: 'Issue', argument: 'Details', timestamp: 60 }],
    }
    expect(ComplianceSchema.parse(compliance)).toEqual(compliance)
  })

  it('rejects invalid status', () => {
    expect(() => ComplianceSchema.parse({ status: 'error', items: [] })).toThrow()
  })
})

describe('ThumbnailsSchema', () => {
  it('accepts empty thumbnails object', () => {
    expect(ThumbnailsSchema.parse({})).toEqual({})
  })

  it('accepts partial thumbnails', () => {
    const partial = {
      high: { url: 'https://example.com/high.jpg', width: 480, height: 360 },
    }
    expect(ThumbnailsSchema.parse(partial)).toEqual(partial)
  })

  it('accepts complete thumbnails', () => {
    const complete = {
      default: { url: 'https://example.com/default.jpg', width: 120, height: 90 },
      medium: { url: 'https://example.com/medium.jpg', width: 320, height: 180 },
      high: { url: 'https://example.com/high.jpg', width: 480, height: 360 },
      standard: { url: 'https://example.com/standard.jpg', width: 640, height: 480 },
      maxres: { url: 'https://example.com/maxres.jpg', width: 1280, height: 720 },
    }
    const result = ThumbnailsSchema.parse(complete)
    expect(result.maxres?.url).toBe('https://example.com/maxres.jpg')
  })

  it('accepts thumbnails without dimensions', () => {
    const noDimensions = {
      high: { url: 'https://example.com/high.jpg' },
    }
    expect(ThumbnailsSchema.parse(noDimensions).high?.url).toBe('https://example.com/high.jpg')
  })
})

describe('StatisticsSchema', () => {
  it('accepts statistics with numbers', () => {
    const stats = { viewCount: 1000, likeCount: 50, commentCount: 10 }
    expect(StatisticsSchema.parse(stats)).toEqual(stats)
  })

  it('accepts statistics with strings (YouTube API sometimes returns strings)', () => {
    const stats = { viewCount: '1000', likeCount: '50', commentCount: '10' }
    expect(StatisticsSchema.parse(stats)).toEqual(stats)
  })

  it('accepts partial statistics', () => {
    const partial = { viewCount: 1000 }
    expect(StatisticsSchema.parse(partial)).toEqual(partial)
  })

  it('accepts empty statistics', () => {
    expect(StatisticsSchema.parse({})).toEqual({})
  })
})

describe('VideoSchema (flat structure)', () => {
  const validVideo = {
    id: 'dQw4w9WgXcQ',
    podcastId: 'pptnc',
    title: 'Test Video',
    description: 'A test video description',
    thumbnails: {
      high: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
    },
    duration: 1200,
    publishedAt: createMockTimestamp(),
    status: 'new',
    videoType: 'episode',
    deleted: false,
  }

  it('accepts valid video with flat YouTube fields', () => {
    const result = VideoSchema.parse(validVideo)
    expect(result.id).toBe('dQw4w9WgXcQ')
    expect(result.title).toBe('Test Video')
    expect(result.status).toBe('new')
    expect(result.videoType).toBe('episode')
  })

  it('accepts video with IAra AI-generated fields', () => {
    const videoWithAIFields = {
      ...validVideo,
      tags: ['tag1', 'tag2'],
      chapters: [{ title: 'Intro', timestamp: 0 }],
      compliance: { status: 'ok', items: [] },
    }
    const result = VideoSchema.parse(videoWithAIFields)
    expect(result.tags).toEqual(['tag1', 'tag2'])
    expect(result.chapters).toHaveLength(1)
  })

  it('accepts video with portal-web specific fields', () => {
    const videoWithPortalFields = {
      ...validVideo,
      transcriptionSRT: '1\n00:00:00,000 --> 00:00:05,000\nHello',
      transcriptionTXT: 'Hello world',
      guests: ['Guest 1'],
      topics: ['Topic A'],
      statistics: { viewCount: 1000 },
    }
    const result = VideoSchema.parse(videoWithPortalFields)
    expect(result.transcriptionTXT).toBe('Hello world')
    expect(result.guests).toEqual(['Guest 1'])
  })

  it('defaults deleted to false', () => {
    const videoWithoutDeleted = { ...validVideo }
    delete (videoWithoutDeleted as Record<string, unknown>).deleted
    const result = VideoSchema.parse(videoWithoutDeleted)
    expect(result.deleted).toBe(false)
  })

  it('accepts video without timestamps (legacy docs)', () => {
    const videoWithoutTimestamps = { ...validVideo }
    // createdAt and updatedAt are optional for legacy docs
    const result = VideoSchema.parse(videoWithoutTimestamps)
    expect(result.id).toBe('dQw4w9WgXcQ')
  })

  it('rejects video without id', () => {
    const { id: _id, ...videoWithoutId } = validVideo
    expect(() => VideoSchema.parse(videoWithoutId)).toThrow()
  })

  it('rejects video without podcastId', () => {
    const { podcastId: _podcastId, ...videoWithoutPodcastId } = validVideo
    expect(() => VideoSchema.parse(videoWithoutPodcastId)).toThrow()
  })

  it('rejects video without title', () => {
    const { title: _title, ...videoWithoutTitle } = validVideo
    expect(() => VideoSchema.parse(videoWithoutTitle)).toThrow()
  })

  it('rejects video with invalid status', () => {
    const invalidVideo = { ...validVideo, status: 'invalid' }
    expect(() => VideoSchema.parse(invalidVideo)).toThrow()
  })

  it('rejects video with invalid videoType', () => {
    const invalidVideo = { ...validVideo, videoType: 'invalid' }
    expect(() => VideoSchema.parse(invalidVideo)).toThrow()
  })

  it('passes through unknown fields (passthrough)', () => {
    const videoWithCustomFields = {
      ...validVideo,
      customField: 'custom value',
      legacyField: 123,
    }
    const result = VideoSchema.parse(videoWithCustomFields)
    expect((result as Record<string, unknown>).customField).toBe('custom value')
    expect((result as Record<string, unknown>).legacyField).toBe(123)
  })
})

describe('VideoCreateSchema', () => {
  const validVideoCreate = {
    id: 'abc123',
    podcastId: 'pptnc',
    title: 'Test Video',
    description: 'Description',
    thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
    duration: 600,
    publishedAt: createMockTimestamp(),
    status: 'new',
    videoType: 'cut',
    deleted: false,
  }

  it('accepts valid video create input', () => {
    const result = VideoCreateSchema.parse(validVideoCreate)
    expect(result.id).toBe('abc123')
    expect(result.title).toBe('Test Video')
    expect(result.status).toBe('new')
  })

  it('defaults deleted to false', () => {
    const withoutDeleted = { ...validVideoCreate }
    delete (withoutDeleted as Record<string, unknown>).deleted
    const result = VideoCreateSchema.parse(withoutDeleted)
    expect(result.deleted).toBe(false)
  })
})

describe('VideoUpdateSchema', () => {
  it('accepts partial update with status only', () => {
    const result = VideoUpdateSchema.parse({ status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('accepts partial update with title', () => {
    const result = VideoUpdateSchema.parse({ title: 'Updated Title' })
    expect(result.title).toBe('Updated Title')
  })

  it('accepts partial update with AI-generated fields', () => {
    const result = VideoUpdateSchema.parse({
      tags: ['tag1', 'tag2'],
      chapters: [{ title: 'Intro', timestamp: 0 }],
    })
    expect(result.tags).toEqual(['tag1', 'tag2'])
    expect(result.chapters).toHaveLength(1)
  })

  it('accepts empty update', () => {
    const result = VideoUpdateSchema.parse({})
    expect(result).toEqual({})
  })

  it('rejects id in update (immutable field)', () => {
    // VideoUpdateSchema excludes id, so it should be stripped
    const input = { id: 'new-id', status: 'draft' }
    const result = VideoUpdateSchema.parse(input)
    expect(result).not.toHaveProperty('id')
  })

  it('rejects podcastId in update (immutable field)', () => {
    const input = { podcastId: 'new-podcast', status: 'draft' }
    const result = VideoUpdateSchema.parse(input)
    expect(result).not.toHaveProperty('podcastId')
  })
})

describe('VideoSummarySchema', () => {
  const validSummary = {
    id: 'abc123',
    title: 'Test Video',
    thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
    duration: 600,
    status: 'new',
    videoType: 'cut',
    deleted: false,
  }

  it('accepts valid video summary', () => {
    const result = VideoSummarySchema.parse(validSummary)
    expect(result.id).toBe('abc123')
    expect(result.title).toBe('Test Video')
  })

  it('accepts summary without thumbnails (optional)', () => {
    const withoutThumbnails = { ...validSummary }
    delete (withoutThumbnails as Record<string, unknown>).thumbnails
    const result = VideoSummarySchema.parse(withoutThumbnails)
    expect(result.thumbnails).toBeUndefined()
  })

  it('rejects summary with missing required fields', () => {
    const { title: _title, ...withoutTitle } = validSummary
    expect(() => VideoSummarySchema.parse(withoutTitle)).toThrow()
  })
})
