import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock getAI before importing cache module
const mockCachesList = vi.fn()
const mockCachesCreate = vi.fn()

const mockAI = vi.hoisted(() => ({
  getAI: vi.fn(() => ({
    caches: {
      list: mockCachesList,
      create: mockCachesCreate,
    },
  })),
}))

vi.mock('./client', () => ({
  getAI: mockAI.getAI,
}))

// Mock logger to prevent noise in tests
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { getOrCreateCache, buildCacheDisplayName, clearCacheNameMap } from './cache'

describe('buildCacheDisplayName', () => {
  it('includes videoId, format, model hash, and content hash', () => {
    const name = buildCacheDisplayName('video123', 'srt', 'gemini-2.5-flash', 'some content')

    expect(name).toMatch(/^iara-video123-srt-[a-f0-9]{6}-[a-f0-9]{8}$/)
  })

  it('produces different names for different models (F3 fix)', () => {
    const content = 'same content'
    const nameFlash = buildCacheDisplayName('video123', 'srt', 'gemini-2.5-flash', content)
    const namePro = buildCacheDisplayName('video123', 'srt', 'gemini-2.5-pro', content)

    expect(nameFlash).not.toBe(namePro)
  })

  it('produces different names for different content (F12 fix)', () => {
    const model = 'gemini-2.5-flash'
    const nameV1 = buildCacheDisplayName('video123', 'srt', model, 'original transcription')
    const nameV2 = buildCacheDisplayName('video123', 'srt', model, 'corrected transcription')

    expect(nameV1).not.toBe(nameV2)
  })

  it('produces different names for different formats', () => {
    const content = 'same content'
    const model = 'gemini-2.5-flash'
    const nameSrt = buildCacheDisplayName('video123', 'srt', model, content)
    const nameTxt = buildCacheDisplayName('video123', 'txt', model, content)

    expect(nameSrt).not.toBe(nameTxt)
  })

  it('produces different names for different videoIds', () => {
    const content = 'same content'
    const model = 'gemini-2.5-flash'
    const nameA = buildCacheDisplayName('video-A', 'srt', model, content)
    const nameB = buildCacheDisplayName('video-B', 'srt', model, content)

    expect(nameA).not.toBe(nameB)
  })

  it('is deterministic for same inputs', () => {
    const args = ['video123', 'srt', 'gemini-2.5-flash', 'content'] as const
    const name1 = buildCacheDisplayName(...args)
    const name2 = buildCacheDisplayName(...args)

    expect(name1).toBe(name2)
  })
})

describe('getOrCreateCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCacheNameMap()
  })

  // Helper to create an async iterable from an array (simulates Pager<CachedContent>)
  function createAsyncIterable<T>(items: T[]) {
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const item of items) {
          yield item
        }
      },
    }
  }

  describe('token threshold', () => {
    it('returns null when content is below minimum token threshold', async () => {
      const smallContent = 'Short content'

      const result = await getOrCreateCache('video123', 'srt', smallContent, 'gemini-2.5-flash')

      expect(result).toBeNull()
      expect(mockCachesList).not.toHaveBeenCalled()
      expect(mockCachesCreate).not.toHaveBeenCalled()
    })

    it('proceeds with caching when content exceeds minimum token threshold', async () => {
      const largeContent = 'A'.repeat(140000)
      mockCachesList.mockResolvedValue(createAsyncIterable([]))
      mockCachesCreate.mockResolvedValue({ name: 'cached-content-123' })

      const result = await getOrCreateCache('video123', 'srt', largeContent, 'gemini-2.5-flash')

      expect(result).toBe('cached-content-123')
      expect(mockCachesCreate).toHaveBeenCalled()
    })
  })

  describe('cache miss → create', () => {
    const largeContent = 'A'.repeat(140000)

    it('creates cache when none exists', async () => {
      mockCachesList.mockResolvedValue(createAsyncIterable([]))
      mockCachesCreate.mockResolvedValue({ name: 'new-cache-456' })

      const result = await getOrCreateCache('video123', 'srt', largeContent, 'gemini-2.5-flash')

      expect(result).toBe('new-cache-456')
      expect(mockCachesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.5-flash',
          config: expect.objectContaining({
            displayName: buildCacheDisplayName('video123', 'srt', 'gemini-2.5-flash', largeContent),
            ttl: '172800s',
          }),
        })
      )
    })
  })

  describe('in-memory cache Map (F4+F5 fix)', () => {
    const largeContent = 'A'.repeat(140000)

    it('returns from in-memory Map on second call without hitting API', async () => {
      mockCachesList.mockResolvedValue(createAsyncIterable([]))
      mockCachesCreate.mockResolvedValue({ name: 'cache-001' })

      // First call: creates cache
      await getOrCreateCache('video123', 'srt', largeContent, 'gemini-2.5-flash')
      expect(mockCachesCreate).toHaveBeenCalledTimes(1)

      vi.clearAllMocks()

      // Second call: should use in-memory Map, no API calls
      const result = await getOrCreateCache('video123', 'srt', largeContent, 'gemini-2.5-flash')

      expect(result).toBe('cache-001')
      expect(mockCachesList).not.toHaveBeenCalled()
      expect(mockCachesCreate).not.toHaveBeenCalled()
    })
  })

  describe('cache hit from API → reuse', () => {
    const largeContent = 'A'.repeat(140000)

    it('reuses existing cache when displayName matches in API list', async () => {
      const expectedDisplayName = buildCacheDisplayName('video123', 'srt', 'gemini-2.5-flash', largeContent)
      mockCachesList.mockResolvedValue(createAsyncIterable([
        { displayName: expectedDisplayName, name: 'existing-cache-001' },
      ]))

      const result = await getOrCreateCache('video123', 'srt', largeContent, 'gemini-2.5-flash')

      expect(result).toBe('existing-cache-001')
      expect(mockCachesCreate).not.toHaveBeenCalled()
    })

    it('ignores caches with different displayName', async () => {
      mockCachesList.mockResolvedValue(createAsyncIterable([
        { displayName: 'iara-other-video-srt-abc123-def456', name: 'other-cache-001' },
      ]))
      mockCachesCreate.mockResolvedValue({ name: 'new-cache-for-video123' })

      const result = await getOrCreateCache('video123', 'srt', largeContent, 'gemini-2.5-flash')

      expect(result).toBe('new-cache-for-video123')
      expect(mockCachesCreate).toHaveBeenCalled()
    })
  })

  describe('cache expired / list error → recreate', () => {
    const largeContent = 'A'.repeat(140000)

    it('creates new cache when list() throws error', async () => {
      mockCachesList.mockRejectedValue(new Error('API error'))
      mockCachesCreate.mockResolvedValue({ name: 'recreated-cache-001' })

      const result = await getOrCreateCache('video123', 'srt', largeContent, 'gemini-2.5-flash')

      expect(result).toBe('recreated-cache-001')
      expect(mockCachesCreate).toHaveBeenCalled()
    })
  })

  describe('fallback on create failure', () => {
    const largeContent = 'A'.repeat(140000)

    it('returns null when create() throws error', async () => {
      mockCachesList.mockResolvedValue(createAsyncIterable([]))
      mockCachesCreate.mockRejectedValue(new Error('Quota exceeded'))

      const result = await getOrCreateCache('video123', 'srt', largeContent, 'gemini-2.5-flash')

      expect(result).toBeNull()
    })

    it('does not propagate error when create() fails', async () => {
      mockCachesList.mockResolvedValue(createAsyncIterable([]))
      mockCachesCreate.mockRejectedValue(new Error('Internal server error'))

      await expect(
        getOrCreateCache('video123', 'srt', largeContent, 'gemini-2.5-flash')
      ).resolves.toBeNull()
    })
  })

  describe('model isolation (F3 fix)', () => {
    const largeContent = 'A'.repeat(140000)

    it('does not reuse cache created for different model', async () => {
      const flashDisplayName = buildCacheDisplayName('video123', 'srt', 'gemini-2.5-flash', largeContent)
      mockCachesList.mockResolvedValue(createAsyncIterable([
        { displayName: flashDisplayName, name: 'flash-cache' },
      ]))
      mockCachesCreate.mockResolvedValue({ name: 'pro-cache' })

      // Request with different model — should NOT match the flash cache
      const result = await getOrCreateCache('video123', 'srt', largeContent, 'gemini-2.5-pro')

      expect(result).toBe('pro-cache')
      expect(mockCachesCreate).toHaveBeenCalled()
    })
  })

  describe('content isolation (F12 fix)', () => {
    const largeContentV1 = 'A'.repeat(140000)
    const largeContentV2 = 'B'.repeat(140000)

    it('does not reuse cache when content changes', async () => {
      const v1DisplayName = buildCacheDisplayName('video123', 'srt', 'gemini-2.5-flash', largeContentV1)
      mockCachesList.mockResolvedValue(createAsyncIterable([
        { displayName: v1DisplayName, name: 'v1-cache' },
      ]))
      mockCachesCreate.mockResolvedValue({ name: 'v2-cache' })

      // Request with different content — should NOT match v1 cache
      const result = await getOrCreateCache('video123', 'srt', largeContentV2, 'gemini-2.5-flash')

      expect(result).toBe('v2-cache')
      expect(mockCachesCreate).toHaveBeenCalled()
    })
  })

  describe('format isolation', () => {
    const largeContent = 'A'.repeat(140000)

    it('does not reuse SRT cache for TXT format', async () => {
      const srtDisplayName = buildCacheDisplayName('video123', 'srt', 'gemini-2.5-flash', largeContent)
      mockCachesList.mockResolvedValue(createAsyncIterable([
        { displayName: srtDisplayName, name: 'srt-cache' },
      ]))
      mockCachesCreate.mockResolvedValue({ name: 'new-txt-cache' })

      const result = await getOrCreateCache('video123', 'txt', largeContent, 'gemini-2.5-flash')

      expect(result).toBe('new-txt-cache')
      expect(mockCachesCreate).toHaveBeenCalled()
    })
  })
})
