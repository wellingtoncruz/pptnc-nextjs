import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock setup ---

const mockDocGet = vi.fn()
const mockDocUpdate = vi.fn()

vi.mock('./video-doc-ref', () => ({
  getVideoDocRef: vi.fn(() => ({ get: mockDocGet, update: mockDocUpdate })),
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
import { getVideoDocRef } from './video-doc-ref'
import { getAdwordsData, saveAdwordsData } from './adwords-admin'

function createTimestamp() {
  return {
    toDate: () => new Date(),
    toMillis: () => Date.now(),
    seconds: Math.floor(Date.now() / 1000),
    nanoseconds: 0,
  }
}

describe('getAdwordsData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns adwords data when field exists', async () => {
    const now = createTimestamp()
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        title: 'Episode 1',
        adwords: {
          guide: '# Guia AdWords',
          keywords: ['podcast', 'tech'],
          generatedAt: now,
        },
      }),
    })

    const result = await getAdwordsData('video-1')

    expect(result).toEqual({
      guide: '# Guia AdWords',
      keywords: ['podcast', 'tech'],
      generatedAt: now,
    })
    expect(getVideoDocRef).toHaveBeenCalledWith('video-1')
    expect(log).toHaveBeenCalledWith('INFO', 'AdWords data fetched', { videoId: 'video-1', found: true })
  })

  it('returns adwords data with additionalContext', async () => {
    const now = createTimestamp()
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        adwords: {
          guide: '# Guia',
          keywords: [],
          generatedAt: now,
          additionalContext: 'Focar em IA',
        },
      }),
    })

    const result = await getAdwordsData('video-1')

    expect(result).not.toBeNull()
    expect(result!.additionalContext).toBe('Focar em IA')
  })

  it('returns null when document does not exist', async () => {
    mockDocGet.mockResolvedValue({
      exists: false,
      data: () => undefined,
    })

    const result = await getAdwordsData('video-missing')

    expect(result).toBeNull()
    expect(log).toHaveBeenCalledWith('INFO', 'AdWords data fetched', { videoId: 'video-missing', found: false })
  })

  it('returns null when adwords field is not present', async () => {
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ title: 'Episode 1' }),
    })

    const result = await getAdwordsData('video-no-adwords')

    expect(result).toBeNull()
    expect(log).toHaveBeenCalledWith('INFO', 'AdWords data fetched', { videoId: 'video-no-adwords', found: false })
  })

  it('returns null and logs warning when adwords data fails validation', async () => {
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        adwords: { guide: 123, keywords: 'not-array' },
      }),
    })

    const result = await getAdwordsData('video-invalid')

    expect(result).toBeNull()
    expect(log).toHaveBeenCalledWith('WARN', 'Invalid adwords data skipped', expect.objectContaining({
      videoId: 'video-invalid',
    }))
  })
})

describe('saveAdwordsData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDocUpdate.mockResolvedValue(undefined)
  })

  it('saves adwords data with server timestamp', async () => {
    await saveAdwordsData('video-1', {
      guide: '# Guia AdWords',
      keywords: ['podcast', 'tech'],
    })

    expect(mockDocUpdate).toHaveBeenCalledWith({
      adwords: {
        guide: '# Guia AdWords',
        keywords: ['podcast', 'tech'],
        generatedAt: 'MOCK_SERVER_TIMESTAMP',
      },
    })
    expect(getVideoDocRef).toHaveBeenCalledWith('video-1')
    expect(log).toHaveBeenCalledWith('INFO', 'AdWords data saved', { videoId: 'video-1' })
  })

  it('saves adwords data with additionalContext', async () => {
    await saveAdwordsData('video-1', {
      guide: '# Guia',
      keywords: [],
      additionalContext: 'Instruções extras',
    })

    expect(mockDocUpdate).toHaveBeenCalledWith({
      adwords: {
        guide: '# Guia',
        keywords: [],
        additionalContext: 'Instruções extras',
        generatedAt: 'MOCK_SERVER_TIMESTAMP',
      },
    })
  })

  it('saves without additionalContext when not provided', async () => {
    await saveAdwordsData('video-1', {
      guide: '# Guia',
      keywords: ['test'],
    })

    const updateArg = mockDocUpdate.mock.calls[0][0]
    expect(updateArg.adwords).not.toHaveProperty('additionalContext')
  })

  it('propagates Firestore errors to caller', async () => {
    mockDocUpdate.mockRejectedValue(new Error('Firestore unavailable'))

    await expect(
      saveAdwordsData('video-1', { guide: '# Guia', keywords: [] })
    ).rejects.toThrow('Firestore unavailable')
  })
})
