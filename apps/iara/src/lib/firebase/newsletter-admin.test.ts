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
import { getNewsletterData, saveNewsletterData } from './newsletter-admin'

function createTimestamp() {
  return {
    toDate: () => new Date(),
    toMillis: () => Date.now(),
    seconds: Math.floor(Date.now() / 1000),
    nanoseconds: 0,
  }
}

describe('getNewsletterData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns newsletter data when field exists', async () => {
    const now = createTimestamp()
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        title: 'Episode 1',
        newsletter: {
          status: 'draft',
          draft: 'Conteúdo do draft',
          generatedAt: now,
        },
      }),
    })

    const result = await getNewsletterData('video-1')

    expect(result).toEqual({
      status: 'draft',
      draft: 'Conteúdo do draft',
      generatedAt: now,
    })
    expect(getVideoDocRef).toHaveBeenCalledWith('video-1')
    expect(log).toHaveBeenCalledWith('INFO', 'Newsletter data fetched', { videoId: 'video-1', found: true })
  })

  it('returns null when document does not exist', async () => {
    mockDocGet.mockResolvedValue({
      exists: false,
      data: () => undefined,
    })

    const result = await getNewsletterData('video-missing')

    expect(result).toBeNull()
    expect(log).toHaveBeenCalledWith('INFO', 'Newsletter data fetched', { videoId: 'video-missing', found: false })
  })

  it('returns null when newsletter field is not present', async () => {
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ title: 'Episode 1' }),
    })

    const result = await getNewsletterData('video-no-newsletter')

    expect(result).toBeNull()
    expect(log).toHaveBeenCalledWith('INFO', 'Newsletter data fetched', { videoId: 'video-no-newsletter', found: false })
  })

  it('returns null and logs warning when newsletter data fails validation', async () => {
    mockDocGet.mockResolvedValue({
      exists: true,
      data: () => ({
        newsletter: { status: 'invalid_status', draft: 123 },
      }),
    })

    const result = await getNewsletterData('video-invalid')

    expect(result).toBeNull()
    expect(log).toHaveBeenCalledWith('WARN', 'Invalid newsletter data skipped', expect.objectContaining({
      videoId: 'video-invalid',
    }))
  })
})

describe('saveNewsletterData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDocUpdate.mockResolvedValue(undefined)
  })

  it('saves newsletter data with server timestamp', async () => {
    await saveNewsletterData('video-1', {
      status: 'draft',
      draft: 'Conteúdo do draft',
    })

    expect(mockDocUpdate).toHaveBeenCalledWith({
      newsletter: {
        status: 'draft',
        draft: 'Conteúdo do draft',
        generatedAt: 'MOCK_SERVER_TIMESTAMP',
      },
    })
    expect(getVideoDocRef).toHaveBeenCalledWith('video-1')
    expect(log).toHaveBeenCalledWith('INFO', 'Newsletter data saved', { videoId: 'video-1' })
  })

  it('saves newsletter data with news array', async () => {
    await saveNewsletterData('video-1', {
      status: 'news_selected',
      draft: 'Draft content',
      news: [
        { id: 'n1', title: 'News 1', source: 'Source A' },
        { id: 'n2', title: 'News 2' },
      ],
    })

    expect(mockDocUpdate).toHaveBeenCalledWith({
      newsletter: {
        status: 'news_selected',
        draft: 'Draft content',
        news: [
          { id: 'n1', title: 'News 1', source: 'Source A' },
          { id: 'n2', title: 'News 2' },
        ],
        generatedAt: 'MOCK_SERVER_TIMESTAMP',
      },
    })
  })

  it('propagates Firestore errors to caller', async () => {
    mockDocUpdate.mockRejectedValue(new Error('Firestore unavailable'))

    await expect(
      saveNewsletterData('video-1', { status: 'idle' })
    ).rejects.toThrow('Firestore unavailable')
  })
})
