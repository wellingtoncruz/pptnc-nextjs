import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock setup ---

// For getSocialNetworks (flat chain)
const mockNetworksGet = vi.fn()
const mockNetworksOrderBy = vi.fn(() => ({ get: mockNetworksGet }))

// For getSocialPosts / upsertSocialPost (subcollection chain)
const mockPostsGet = vi.fn()
const mockPostsSet = vi.fn()
const mockPostsDoc = vi.fn(() => ({ set: mockPostsSet }))
const mockPostsCollection = vi.fn((): { get: typeof mockPostsGet; doc: typeof mockPostsDoc } => ({
  get: mockPostsGet,
  doc: mockPostsDoc,
}))
const mockVideoDoc = vi.fn(() => ({ collection: mockPostsCollection }))
const mockVideosCollection = vi.fn(() => ({ doc: mockVideoDoc }))
const mockPodcastDoc = vi.fn(() => ({ collection: mockVideosCollection }))

const mockCollection = vi.fn((name: string) => {
  if (name === 'socialNetworks') {
    return { orderBy: mockNetworksOrderBy }
  }
  return { doc: mockPodcastDoc }
})

vi.mock('./admin', () => ({
  getAdminDb: vi.fn(() => ({
    collection: mockCollection,
  })),
}))

vi.mock('./config', () => ({
  PODCAST_ID: 'test-podcast',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

const mockServerTimestamp = vi.fn(() => 'MOCK_SERVER_TIMESTAMP')
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => mockServerTimestamp(),
  },
}))

import { log } from '@/lib/logger'
import { getSocialNetworks, getSocialPosts, saveSocialPostFromLLM, upsertSocialPost } from './social-admin'

// Helper to create a mock Firestore document
function createMockDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    data: () => data,
  }
}

// Helper to create a mock Firestore Timestamp
function createTimestamp() {
  return {
    toDate: () => new Date(),
    toMillis: () => Date.now(),
    seconds: Math.floor(Date.now() / 1000),
    nanoseconds: 0,
  }
}

describe('getSocialNetworks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when collection is empty', async () => {
    mockNetworksGet.mockResolvedValue({ empty: true, docs: [] })

    const result = await getSocialNetworks()

    expect(result).toEqual([])
    expect(mockCollection).toHaveBeenCalledWith('socialNetworks')
    expect(mockNetworksOrderBy).toHaveBeenCalledWith('name')
    expect(log).toHaveBeenCalledWith('INFO', 'No social networks found in global catalog')
  })

  it('returns valid social networks ordered by name', async () => {
    const now = createTimestamp()
    mockNetworksGet.mockResolvedValue({
      empty: false,
      docs: [
        createMockDoc('instagram', { name: 'Instagram', icon: '📸', createdAt: now }),
        createMockDoc('linkedin', { name: 'LinkedIn', icon: '💼', createdAt: now }),
      ],
    })

    const result = await getSocialNetworks()

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 'instagram', name: 'Instagram', icon: '📸', createdAt: now })
    expect(result[1]).toEqual({ id: 'linkedin', name: 'LinkedIn', icon: '💼', createdAt: now })
    expect(log).toHaveBeenCalledWith('INFO', 'Social networks fetched', { count: 2 })
  })

  it('skips invalid documents and logs warning', async () => {
    const now = createTimestamp()
    mockNetworksGet.mockResolvedValue({
      empty: false,
      docs: [
        createMockDoc('instagram', { name: 'Instagram', icon: '📸', createdAt: now }),
        createMockDoc('broken', { icon: '❌' }), // missing name and createdAt
        createMockDoc('linkedin', { name: 'LinkedIn', icon: '💼', createdAt: now }),
      ],
    })

    const result = await getSocialNetworks()

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('instagram')
    expect(result[1].id).toBe('linkedin')
    expect(log).toHaveBeenCalledWith('WARN', 'Invalid social network document skipped', expect.objectContaining({
      networkId: 'broken',
      issues: expect.any(Array),
    }))
  })

  it('returns empty array when all documents are invalid', async () => {
    mockNetworksGet.mockResolvedValue({
      empty: false,
      docs: [
        createMockDoc('broken1', {}),
        createMockDoc('broken2', { name: '' }),
      ],
    })

    const result = await getSocialNetworks()

    expect(result).toEqual([])
    expect(log).toHaveBeenCalledWith('INFO', 'Social networks fetched', { count: 0 })
  })

  it('propagates Firestore errors to caller', async () => {
    mockNetworksGet.mockRejectedValue(new Error('Firestore unavailable'))

    await expect(getSocialNetworks()).rejects.toThrow('Firestore unavailable')
  })

  it('injects document ID as id field', async () => {
    const now = createTimestamp()
    mockNetworksGet.mockResolvedValue({
      empty: false,
      docs: [
        createMockDoc('my-network', { name: 'Test', icon: '🧪', createdAt: now }),
      ],
    })

    const result = await getSocialNetworks()

    expect(result[0].id).toBe('my-network')
  })
})

describe('getSocialPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when subcollection is empty', async () => {
    mockPostsGet.mockResolvedValue({ empty: true, docs: [] })

    const result = await getSocialPosts('video-123')

    expect(result).toEqual([])
    expect(mockCollection).toHaveBeenCalledWith('podcasts')
    expect(mockPodcastDoc).toHaveBeenCalledWith('test-podcast')
    expect(mockVideosCollection).toHaveBeenCalledWith('videos')
    expect(mockVideoDoc).toHaveBeenCalledWith('video-123')
    expect(mockPostsCollection).toHaveBeenCalledWith('socialPosts')
    expect(log).toHaveBeenCalledWith('INFO', 'No social posts found', { videoId: 'video-123' })
  })

  it('returns valid social posts', async () => {
    const now = createTimestamp()
    mockPostsGet.mockResolvedValue({
      empty: false,
      docs: [
        createMockDoc('instagram', {
          cta: 'Confira!',
          body: 'Novo episódio disponível',
          hashtags: ['#podcast', '#tech'],
          generatedAt: now,
          updatedAt: now,
          processedBy: 'llm',
        }),
      ],
    })

    const result = await getSocialPosts('video-123')

    expect(result).toHaveLength(1)
    expect(result[0].networkId).toBe('instagram')
    expect(result[0].cta).toBe('Confira!')
    expect(result[0].body).toBe('Novo episódio disponível')
    expect(result[0].hashtags).toEqual(['#podcast', '#tech'])
    expect(result[0].processedBy).toBe('llm')
    expect(log).toHaveBeenCalledWith('INFO', 'Social posts fetched', { videoId: 'video-123', count: 1 })
  })

  it('skips invalid documents and logs warning', async () => {
    const now = createTimestamp()
    mockPostsGet.mockResolvedValue({
      empty: false,
      docs: [
        createMockDoc('instagram', {
          cta: 'Valid',
          body: 'Valid body',
          hashtags: [],
          generatedAt: now,
          updatedAt: now,
          processedBy: 'llm',
        }),
        createMockDoc('broken', { cta: 'Missing fields' }), // missing required fields
      ],
    })

    const result = await getSocialPosts('video-123')

    expect(result).toHaveLength(1)
    expect(result[0].networkId).toBe('instagram')
    expect(log).toHaveBeenCalledWith('WARN', 'Invalid social post document skipped', expect.objectContaining({
      videoId: 'video-123',
      networkId: 'broken',
    }))
  })

  it('includes additionalContext when present', async () => {
    const now = createTimestamp()
    mockPostsGet.mockResolvedValue({
      empty: false,
      docs: [
        createMockDoc('linkedin', {
          cta: 'Check it out',
          body: 'New episode',
          hashtags: [],
          additionalContext: 'Focus on AI topics',
          generatedAt: now,
          updatedAt: now,
          processedBy: 'llm',
        }),
      ],
    })

    const result = await getSocialPosts('video-123')

    expect(result[0].additionalContext).toBe('Focus on AI topics')
  })

  it('propagates Firestore errors to caller', async () => {
    mockPostsGet.mockRejectedValue(new Error('Subcollection error'))

    await expect(getSocialPosts('video-123')).rejects.toThrow('Subcollection error')
  })
})

describe('upsertSocialPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPostsSet.mockResolvedValue(undefined)
  })

  it('upserts a valid social post with merge', async () => {
    await upsertSocialPost('video-123', 'instagram', {
      cta: 'Confira!',
      body: 'Novo episódio',
      hashtags: ['#podcast'],
    })

    expect(mockPostsDoc).toHaveBeenCalledWith('instagram')
    expect(mockPostsSet).toHaveBeenCalledWith(
      {
        cta: 'Confira!',
        body: 'Novo episódio',
        hashtags: ['#podcast'],
        networkId: 'instagram',
        processedBy: 'manual',
        updatedAt: 'MOCK_SERVER_TIMESTAMP',
      },
      { merge: true }
    )
  })

  it('sets processedBy to manual', async () => {
    await upsertSocialPost('video-123', 'linkedin', {
      cta: 'Test',
      body: 'Body',
      hashtags: [],
    })

    const setCall = mockPostsSet.mock.calls[0]
    expect(setCall[0].processedBy).toBe('manual')
  })

  it('logs INFO after successful upsert', async () => {
    await upsertSocialPost('video-123', 'instagram', {
      cta: 'CTA',
      body: 'Body',
      hashtags: [],
    })

    expect(log).toHaveBeenCalledWith('INFO', 'Social post upserted', {
      videoId: 'video-123',
      networkId: 'instagram',
      processedBy: 'manual',
    })
  })

  it('rejects invalid data with ZodError', async () => {
    await expect(
      upsertSocialPost('video-123', 'instagram', {
        cta: 'Valid',
        body: 'Valid',
        hashtags: 'not-an-array',
      } as never)
    ).rejects.toThrow()
  })

  it('propagates Firestore errors to caller', async () => {
    mockPostsSet.mockRejectedValue(new Error('Write failed'))

    await expect(
      upsertSocialPost('video-123', 'instagram', {
        cta: 'CTA',
        body: 'Body',
        hashtags: [],
      })
    ).rejects.toThrow('Write failed')
  })
})

describe('saveSocialPostFromLLM', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPostsSet.mockResolvedValue(undefined)
  })

  it('persists with processedBy llm and generatedAt', async () => {
    await saveSocialPostFromLLM('video-123', 'instagram', {
      cta: 'Check this out!',
      body: 'Amazing episode about AI',
      hashtags: ['#ai', '#podcast'],
    })

    expect(mockPostsDoc).toHaveBeenCalledWith('instagram')
    expect(mockPostsSet).toHaveBeenCalledWith(
      {
        cta: 'Check this out!',
        body: 'Amazing episode about AI',
        hashtags: ['#ai', '#podcast'],
        networkId: 'instagram',
        processedBy: 'llm',
        generatedAt: 'MOCK_SERVER_TIMESTAMP',
        updatedAt: 'MOCK_SERVER_TIMESTAMP',
      },
      { merge: true }
    )
  })

  it('includes additionalContext when provided', async () => {
    await saveSocialPostFromLLM('video-123', 'linkedin', {
      cta: 'Read more',
      body: 'Post body',
      hashtags: [],
    }, 'Focus on humor')

    const setCall = mockPostsSet.mock.calls[0]
    expect(setCall[0].additionalContext).toBe('Focus on humor')
  })

  it('does not include additionalContext key when undefined', async () => {
    await saveSocialPostFromLLM('video-123', 'instagram', {
      cta: 'CTA',
      body: 'Body',
      hashtags: [],
    })

    const setCall = mockPostsSet.mock.calls[0]
    expect(setCall[0]).not.toHaveProperty('additionalContext')
  })

  it('uses set with merge true', async () => {
    await saveSocialPostFromLLM('video-123', 'instagram', {
      cta: 'CTA',
      body: 'Body',
      hashtags: [],
    })

    expect(mockPostsSet).toHaveBeenCalledWith(
      expect.any(Object),
      { merge: true }
    )
  })

  it('logs INFO after successful save', async () => {
    await saveSocialPostFromLLM('video-123', 'linkedin', {
      cta: 'CTA',
      body: 'Body',
      hashtags: [],
    })

    expect(log).toHaveBeenCalledWith('INFO', 'Social post saved from LLM', {
      videoId: 'video-123',
      networkId: 'linkedin',
      processedBy: 'llm',
    })
  })

  it('rejects invalid data with ZodError', async () => {
    await expect(
      saveSocialPostFromLLM('video-123', 'instagram', {
        cta: 'Valid',
        body: 'Valid',
        hashtags: 'not-an-array',
      } as never)
    ).rejects.toThrow()
  })
})
