import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetScheduledPost = vi.fn()
const mockUpdateScheduledPost = vi.fn()
const mockPublishWithComment = vi.fn()

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast',
}))

vi.mock('@/lib/firebase/scheduled-posts-admin', () => ({
  getScheduledPost: (...args: unknown[]) => mockGetScheduledPost(...args),
  updateScheduledPost: (...args: unknown[]) => mockUpdateScheduledPost(...args),
}))

vi.mock('@/lib/social/publish-orchestrator', () => ({
  publishWithComment: (...args: unknown[]) => mockPublishWithComment(...args),
}))

import { POST } from './route'

function createRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/social/execute', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const mockPost = {
  id: 'post-1',
  sourceType: 'news',
  sourceId: 'news-123',
  content: 'Post content',
  firstComment: 'Links',
  network: 'linkedin',
  networkConfig: { targetId: '12345', targetType: 'page' },
  scheduledBy: 'user-1',
  status: 'scheduled',
  dismissed: false,
}

describe('POST /api/social/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateScheduledPost.mockResolvedValue(undefined)
  })

  it('executes a scheduled post successfully', async () => {
    mockGetScheduledPost.mockResolvedValue(mockPost)
    mockPublishWithComment.mockResolvedValue({
      status: 'published',
      postId: 'post-urn-123',
      commentId: 'comment-456',
    })

    const response = await POST(createRequest({ scheduledPostId: 'post-1' }))
    const data = await response.json()

    expect(data.data.status).toBe('published')
    expect(mockUpdateScheduledPost).toHaveBeenCalledTimes(2)
    // First call: status → publishing
    expect(mockUpdateScheduledPost).toHaveBeenNthCalledWith(1, 'test-podcast', 'post-1', { status: 'publishing' })
  })

  it('skips when post not found', async () => {
    mockGetScheduledPost.mockResolvedValue(null)

    const response = await POST(createRequest({ scheduledPostId: 'missing' }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.skipped).toBe(true)
  })

  it('skips when already cancelled', async () => {
    mockGetScheduledPost.mockResolvedValue({ ...mockPost, status: 'cancelled' })

    const response = await POST(createRequest({ scheduledPostId: 'post-1' }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.skipped).toBe(true)
    expect(mockPublishWithComment).not.toHaveBeenCalled()
  })

  it('handles partial publish', async () => {
    mockGetScheduledPost.mockResolvedValue(mockPost)
    mockPublishWithComment.mockResolvedValue({
      status: 'partially_published',
      postId: 'post-urn-123',
      error: 'Comment throttled',
    })

    const response = await POST(createRequest({ scheduledPostId: 'post-1' }))
    const data = await response.json()

    expect(data.data.status).toBe('partially_published')
  })

  it('returns 400 when scheduledPostId missing', async () => {
    const response = await POST(createRequest({}))
    expect(response.status).toBe(400)
  })
})
