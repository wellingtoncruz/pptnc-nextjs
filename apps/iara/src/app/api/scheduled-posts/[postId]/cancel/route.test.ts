import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockAuth = vi.fn()
const mockGetScheduledPost = vi.fn()
const mockUpdateScheduledPost = vi.fn()
const mockCancelPublishTask = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

vi.mock('@/lib/auth/require-admin', () => ({
  requireAuth: vi.fn((session) => {
    if (!session) return NextResponse.json({ error: { code: 'AUTH_EXPIRED' } }, { status: 401 })
    return null
  }),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'test-podcast',
}))

vi.mock('@/lib/firebase/scheduled-posts-admin', () => ({
  getScheduledPost: (...args: unknown[]) => mockGetScheduledPost(...args),
  updateScheduledPost: (...args: unknown[]) => mockUpdateScheduledPost(...args),
}))

vi.mock('@/lib/cloud-tasks/scheduler', () => ({
  cancelPublishTask: (...args: unknown[]) => mockCancelPublishTask(...args),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { POST } from './route'

const mockSession = { user: { id: 'user-1', role: 'admin' } }

function createRequest(): NextRequest {
  return new NextRequest('http://localhost/api/scheduled-posts/post-1/cancel', {
    method: 'POST',
  })
}

describe('POST /api/scheduled-posts/[postId]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(mockSession)
    mockUpdateScheduledPost.mockResolvedValue(undefined)
    mockCancelPublishTask.mockResolvedValue(undefined)
  })

  it('cancels a scheduled post', async () => {
    mockGetScheduledPost.mockResolvedValue({
      id: 'post-1',
      status: 'scheduled',
      taskName: 'task-123',
    })

    const response = await POST(createRequest(), { params: Promise.resolve({ postId: 'post-1' }) })
    const data = await response.json()

    expect(data.data.success).toBe(true)
    expect(mockCancelPublishTask).toHaveBeenCalledWith('task-123')
    expect(mockUpdateScheduledPost).toHaveBeenCalledWith('test-podcast', 'post-1', { status: 'cancelled' })
  })

  it('returns 404 when post not found', async () => {
    mockGetScheduledPost.mockResolvedValue(null)

    const response = await POST(createRequest(), { params: Promise.resolve({ postId: 'missing' }) })
    expect(response.status).toBe(404)
  })

  it('returns 400 when post is not in scheduled status', async () => {
    mockGetScheduledPost.mockResolvedValue({
      id: 'post-1',
      status: 'published',
    })

    const response = await POST(createRequest(), { params: Promise.resolve({ postId: 'post-1' }) })
    expect(response.status).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)

    const response = await POST(createRequest(), { params: Promise.resolve({ postId: 'post-1' }) })
    expect(response.status).toBe(401)
  })
})
