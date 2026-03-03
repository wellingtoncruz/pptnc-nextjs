import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGetAll = vi.fn()
const mockDoc = vi.fn()

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: mockDoc,
        })),
      })),
    })),
    getAll: mockGetAll,
  })),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { getVideoSummariesByIds } from './get-video-summaries'

function createDocSnap(id: string, data: Record<string, unknown>, exists = true) {
  return {
    exists,
    id,
    data: () => data,
  }
}

describe('getVideoSummariesByIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDoc.mockReturnValue({})
  })

  it('returns empty array for empty input', async () => {
    const result = await getVideoSummariesByIds('pptnc', [])

    expect(result).toEqual([])
    expect(mockGetAll).not.toHaveBeenCalled()
  })

  it('returns validated video summaries', async () => {
    mockGetAll.mockResolvedValue([
      createDocSnap('vid-1', { title: 'Episode 1', duration: 3600 }),
      createDocSnap('vid-2', { title: 'Episode 2', duration: 7200 }),
    ])

    const result = await getVideoSummariesByIds('pptnc', ['vid-1', 'vid-2'])

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('vid-1')
    expect(result[0].title).toBe('Episode 1')
    expect(result[0].duration).toBe(3600)
    expect(result[1].id).toBe('vid-2')
    expect(result[1].title).toBe('Episode 2')
  })

  it('skips non-existent documents', async () => {
    mockGetAll.mockResolvedValue([
      createDocSnap('vid-1', { title: 'Episode 1', duration: 3600 }),
      createDocSnap('vid-missing', {}, false),
    ])

    const result = await getVideoSummariesByIds('pptnc', ['vid-1', 'vid-missing'])

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('vid-1')
  })

  it('uses fallback title when document has no title', async () => {
    mockGetAll.mockResolvedValue([
      createDocSnap('vid-no-title', { duration: 100 }),
    ])

    const result = await getVideoSummariesByIds('pptnc', ['vid-no-title'])

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Sem título')
  })

  it('logs warning for invalid documents', async () => {
    const { log } = await import('@/lib/logger')
    // id with empty string fails min(1) validation
    mockGetAll.mockResolvedValue([
      { exists: true, id: '', data: () => ({ title: 'Test' }) },
    ])

    const result = await getVideoSummariesByIds('pptnc', [''])

    expect(result).toHaveLength(0)
    expect(log).toHaveBeenCalledWith(
      'WARN',
      'Skipping invalid video in summaries batch',
      expect.objectContaining({ videoId: '' })
    )
  })

  it('includes default schema values for status and videoType', async () => {
    mockGetAll.mockResolvedValue([
      createDocSnap('vid-1', { title: 'Episode', duration: 1000 }),
    ])

    const result = await getVideoSummariesByIds('pptnc', ['vid-1'])

    expect(result[0].status).toBe('new')
    expect(result[0].videoType).toBe('episode')
  })
})
