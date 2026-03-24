import { describe, expect, it } from 'vitest'

import {
  ScheduledPostCreateSchema,
  ScheduledPostSchema,
  ScheduledPostStatusSchema,
  ScheduledPostUpdateSchema,
  SourceTypeSchema,
} from './scheduled-post'

describe('ScheduledPostStatusSchema', () => {
  it.each([
    'scheduled',
    'publishing',
    'published',
    'partially_published',
    'failed',
    'cancelled',
  ])('accepts valid status: %s', (status) => {
    expect(ScheduledPostStatusSchema.safeParse(status).success).toBe(true)
  })

  it('rejects invalid status', () => {
    expect(ScheduledPostStatusSchema.safeParse('pending').success).toBe(false)
  })
})

describe('SourceTypeSchema', () => {
  it.each(['news', 'video', 'newsletter'])('accepts: %s', (type) => {
    expect(SourceTypeSchema.safeParse(type).success).toBe(true)
  })

  it('rejects invalid source type', () => {
    expect(SourceTypeSchema.safeParse('podcast').success).toBe(false)
  })
})

describe('ScheduledPostSchema', () => {
  const mockTimestamp = { toDate: () => new Date(), toMillis: () => 0, seconds: 0, nanoseconds: 0 }

  const validPost = {
    id: 'post-1',
    sourceType: 'news',
    sourceId: 'news-123',
    content: 'Post text content',
    network: 'linkedin',
    networkConfig: { targetId: 'urn:li:organization:12345', targetType: 'page' },
    scheduledAt: mockTimestamp,
    scheduledBy: 'user-1',
    status: 'scheduled',
    dismissed: false,
    createdAt: mockTimestamp,
    updatedAt: mockTimestamp,
  }

  it('parses a valid scheduled post', () => {
    const result = ScheduledPostSchema.safeParse(validPost)
    expect(result.success).toBe(true)
  })

  it('parses with optional fields', () => {
    const result = ScheduledPostSchema.safeParse({
      ...validPost,
      firstComment: 'Links here',
      imageUrl: 'https://storage.googleapis.com/image.png',
      publishedAt: mockTimestamp,
      externalPostId: 'urn:li:share:123',
      externalCommentId: 'urn:li:comment:456',
      error: 'Rate limit exceeded',
      taskName: 'projects/pptnc-stage/locations/us-central1/queues/social-publish/tasks/abc123',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing required fields', () => {
    const { content: _, ...withoutContent } = validPost
    expect(ScheduledPostSchema.safeParse(withoutContent).success).toBe(false)
  })

  it('rejects invalid networkConfig targetType', () => {
    const result = ScheduledPostSchema.safeParse({
      ...validPost,
      networkConfig: { targetId: 'id', targetType: 'group' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty content', () => {
    const result = ScheduledPostSchema.safeParse({ ...validPost, content: '' })
    expect(result.success).toBe(false)
  })

  it('accepts imageUrl as any string (Cloud Storage paths)', () => {
    const result = ScheduledPostSchema.safeParse({ ...validPost, imageUrl: 'news-images/pptnc/123/img.png' })
    expect(result.success).toBe(true)
  })
})

describe('ScheduledPostCreateSchema', () => {
  const validCreate = {
    sourceType: 'news',
    sourceId: 'news-123',
    content: 'Post text',
    network: 'linkedin',
    networkConfig: { targetId: 'urn:li:organization:12345', targetType: 'page' },
    scheduledAt: '2026-04-01T14:30:00.000Z',
    scheduledBy: 'user-1',
  }

  it('parses valid creation data', () => {
    const result = ScheduledPostCreateSchema.safeParse(validCreate)
    expect(result.success).toBe(true)
  })

  it('parses with optional firstComment and imageUrl', () => {
    const result = ScheduledPostCreateSchema.safeParse({
      ...validCreate,
      firstComment: 'Links do episódio',
      imageUrl: 'https://storage.googleapis.com/img.png',
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-ISO scheduledAt', () => {
    const result = ScheduledPostCreateSchema.safeParse({
      ...validCreate,
      scheduledAt: '01/04/2026 14:30',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing sourceType', () => {
    const { sourceType: _, ...without } = validCreate
    expect(ScheduledPostCreateSchema.safeParse(without).success).toBe(false)
  })

  it('rejects empty content', () => {
    expect(
      ScheduledPostCreateSchema.safeParse({ ...validCreate, content: '' }).success
    ).toBe(false)
  })
})

describe('ScheduledPostUpdateSchema', () => {
  it('parses valid status update', () => {
    const result = ScheduledPostUpdateSchema.safeParse({ status: 'published' })
    expect(result.success).toBe(true)
  })

  it('parses multiple fields', () => {
    const result = ScheduledPostUpdateSchema.safeParse({
      status: 'failed',
      error: 'Token expired',
    })
    expect(result.success).toBe(true)
  })

  it('parses dismissed update', () => {
    const result = ScheduledPostUpdateSchema.safeParse({ dismissed: true })
    expect(result.success).toBe(true)
  })

  it('rejects empty object', () => {
    const result = ScheduledPostUpdateSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects invalid status', () => {
    const result = ScheduledPostUpdateSchema.safeParse({ status: 'pending' })
    expect(result.success).toBe(false)
  })
})
