import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockSet = vi.fn()
const mockUpdate = vi.fn()
const mockOrderBy = vi.fn()
const mockStartAfter = vi.fn()
const mockLimit = vi.fn()
const mockWhere = vi.fn()
const mockCountGet = vi.fn()
const mockDocRef = vi.fn()

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromDate: vi.fn((date: Date) => ({
      toDate: () => date,
      toMillis: () => date.getTime(),
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0,
    })),
  },
  FieldValue: {
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  },
}))

vi.mock('./admin', () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: mockDocRef,
          orderBy: mockOrderBy,
          where: mockWhere,
          count: vi.fn(() => ({ get: mockCountGet })),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import {
  createScheduledPost,
  getScheduledPost,
  listScheduledPosts,
  updateScheduledPost,
  countPendingScheduledPosts,
  findScheduledPostsBySource,
} from './scheduled-posts-admin'

function createTimestamp(date: Date) {
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
  }
}

function createMockDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data, exists: true }
}

const ts = createTimestamp(new Date('2026-04-01T14:30:00Z'))

const validCreateInput = {
  sourceType: 'news',
  sourceId: 'news-123',
  content: 'Post content',
  firstComment: 'Links here',
  network: 'linkedin',
  networkConfig: { targetId: 'urn:li:org:123', targetType: 'page' },
  scheduledAt: '2026-04-01T14:30:00.000Z',
  scheduledBy: 'user-1',
}

const mockPostData = {
  sourceType: 'news',
  sourceId: 'news-123',
  content: 'Post content',
  firstComment: 'Links',
  network: 'linkedin',
  networkConfig: { targetId: 'urn:li:org:123', targetType: 'page' },
  scheduledAt: ts,
  scheduledBy: 'user-1',
  status: 'scheduled',
  dismissed: false,
  createdAt: ts,
  updatedAt: ts,
}

describe('createScheduledPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDocRef.mockReturnValue({ id: 'new-post-id', set: mockSet })
    mockSet.mockResolvedValue(undefined)
  })

  it('creates a scheduled post and returns the ID', async () => {
    const id = await createScheduledPost('podcast-1', validCreateInput)

    expect(id).toBe('new-post-id')
    expect(mockSet).toHaveBeenCalledOnce()
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'news',
        sourceId: 'news-123',
        content: 'Post content',
        firstComment: 'Links here',
        network: 'linkedin',
        status: 'scheduled',
        dismissed: false,
      })
    )
  })

  it('omits optional fields when not provided', async () => {
    const { firstComment: _, ...withoutComment } = validCreateInput
    await createScheduledPost('podcast-1', withoutComment)

    const setCall = mockSet.mock.calls[0][0]
    expect(setCall.firstComment).toBeUndefined()
  })

  it('rejects invalid input', async () => {
    await expect(createScheduledPost('podcast-1', { content: '' })).rejects.toThrow()
  })
})

describe('getScheduledPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed post when found', async () => {
    mockDocRef.mockReturnValue({
      get: vi.fn().mockResolvedValue(createMockDoc('post-1', mockPostData)),
    })

    const result = await getScheduledPost('podcast-1', 'post-1')

    expect(result).not.toBeNull()
    expect(result!.id).toBe('post-1')
    expect(result!.status).toBe('scheduled')
  })

  it('returns null when not found', async () => {
    mockDocRef.mockReturnValue({
      get: vi.fn().mockResolvedValue({ exists: false }),
    })

    const result = await getScheduledPost('podcast-1', 'nonexistent')
    expect(result).toBeNull()
  })

  it('returns null when validation fails', async () => {
    mockDocRef.mockReturnValue({
      get: vi.fn().mockResolvedValue(createMockDoc('bad', { status: 'invalid' })),
    })

    const result = await getScheduledPost('podcast-1', 'bad')
    expect(result).toBeNull()
  })
})

describe('listScheduledPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCountGet.mockResolvedValue({ data: () => ({ count: 1 }) })

    // Default chain: orderBy -> limit -> get
    mockLimit.mockReturnValue({ get: mockGet })
    mockOrderBy.mockReturnValue({ limit: mockLimit, where: mockWhere })
    mockStartAfter.mockReturnValue({ limit: mockLimit })
    mockWhere.mockReturnValue({
      limit: mockLimit,
      where: mockWhere,
      orderBy: mockOrderBy,
      count: vi.fn(() => ({ get: mockCountGet })),
    })
  })

  it('returns empty list when no documents', async () => {
    mockGet.mockResolvedValue({ docs: [] })

    const result = await listScheduledPosts('podcast-1')

    expect(result.items).toHaveLength(0)
    expect(result.nextCursor).toBeNull()
  })

  it('returns validated items', async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDoc('post-1', mockPostData)],
    })

    const result = await listScheduledPosts('podcast-1')

    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('post-1')
    expect(result.totalCount).toBe(1)
  })

  it('filters dismissed posts by default', async () => {
    mockGet.mockResolvedValue({
      docs: [
        createMockDoc('post-1', mockPostData),
        createMockDoc('post-2', { ...mockPostData, dismissed: true }),
      ],
    })

    const result = await listScheduledPosts('podcast-1')

    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('post-1')
  })

  it('includes dismissed when excludeDismissed is false', async () => {
    mockGet.mockResolvedValue({
      docs: [
        createMockDoc('post-1', mockPostData),
        createMockDoc('post-2', { ...mockPostData, dismissed: true }),
      ],
    })

    const result = await listScheduledPosts('podcast-1', { excludeDismissed: false })

    expect(result.items).toHaveLength(2)
  })

  it('filters by status array in memory', async () => {
    mockGet.mockResolvedValue({
      docs: [
        createMockDoc('post-1', { ...mockPostData, status: 'scheduled' }),
        createMockDoc('post-2', { ...mockPostData, status: 'published' }),
        createMockDoc('post-3', { ...mockPostData, status: 'failed' }),
      ],
    })

    const result = await listScheduledPosts('podcast-1', {
      status: ['scheduled', 'publishing'],
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].status).toBe('scheduled')
  })
})

describe('updateScheduledPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDocRef.mockReturnValue({ update: mockUpdate })
    mockUpdate.mockResolvedValue(undefined)
  })

  it('updates with valid data', async () => {
    await updateScheduledPost('podcast-1', 'post-1', { status: 'published' })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        updatedAt: 'SERVER_TIMESTAMP',
      })
    )
  })

  it('rejects empty update', async () => {
    await expect(updateScheduledPost('podcast-1', 'post-1', {})).rejects.toThrow()
  })

  it('rejects invalid status', async () => {
    await expect(
      updateScheduledPost('podcast-1', 'post-1', { status: 'invalid' })
    ).rejects.toThrow()
  })
})

describe('countPendingScheduledPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWhere.mockReturnValue({
      where: vi.fn().mockReturnValue({
        count: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ data: () => ({ count: 3 }) }),
        }),
      }),
    })
  })

  it('sums scheduled and publishing counts', async () => {
    const count = await countPendingScheduledPosts('podcast-1')
    expect(count).toBe(6) // 3 + 3
  })
})

describe('findScheduledPostsBySource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWhere.mockReturnValue({
      where: mockWhere,
      get: mockGet,
    })
  })

  it('returns posts matching sourceId', async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDoc('post-1', mockPostData)],
    })

    const results = await findScheduledPostsBySource('podcast-1', 'news-123')

    expect(results).toHaveLength(1)
    expect(results[0].sourceId).toBe('news-123')
  })

  it('returns empty array when no matches', async () => {
    mockGet.mockResolvedValue({ docs: [] })

    const results = await findScheduledPostsBySource('podcast-1', 'news-999')
    expect(results).toHaveLength(0)
  })
})
