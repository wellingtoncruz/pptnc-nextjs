import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock setup ---
const mockSet = vi.fn()
const mockDoc = vi.fn(() => ({ set: mockSet }))
const mockGet = vi.fn()
const mockLimit = vi.fn(() => ({ get: mockGet, startAfter: vi.fn(() => ({ get: mockGet })) }))
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }))
const mockLogsCollection = vi.fn(() => ({
  doc: mockDoc,
  orderBy: mockOrderBy,
}))
const mockPodcastDoc = vi.fn(() => ({ collection: mockLogsCollection }))

vi.mock('./admin', () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({ doc: mockPodcastDoc })),
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
import { saveLlmLog, getLlmLogs } from './llm-log-admin'

const validLogData = {
  component: 'wizard/phase-5',
  model: 'gemini-2.5-flash',
  videoId: 'video-123',
  videoType: 'episode' as const,
  prompt: {
    system: 'You are a content analyst.',
    user: 'Analyze this video.',
  },
  response: 'Analysis result...',
}

describe('saveLlmLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSet.mockResolvedValue(undefined)
  })

  it('saves log to correct subcollection path', async () => {
    await saveLlmLog('podcast-1', validLogData)

    expect(mockPodcastDoc).toHaveBeenCalledWith('podcast-1')
    expect(mockLogsCollection).toHaveBeenCalledWith('llmLogs')
    expect(mockDoc).toHaveBeenCalled()
  })

  it('includes server timestamp in saved data', async () => {
    await saveLlmLog('podcast-1', validLogData)

    expect(mockSet).toHaveBeenCalledWith({
      ...validLogData,
      createdAt: 'MOCK_SERVER_TIMESTAMP',
    })
  })

  it('logs success after saving', async () => {
    await saveLlmLog('podcast-1', validLogData)

    expect(log).toHaveBeenCalledWith('INFO', 'LLM debug log saved', {
      component: 'wizard/phase-5',
      videoId: 'video-123',
      model: 'gemini-2.5-flash',
    })
  })

  it('rejects invalid data', async () => {
    await expect(saveLlmLog('podcast-1', { ...validLogData, component: '' })).rejects.toThrow()
  })

  it('propagates Firestore write errors', async () => {
    mockSet.mockRejectedValue(new Error('Firestore unavailable'))

    await expect(saveLlmLog('podcast-1', validLogData)).rejects.toThrow('Firestore unavailable')
  })
})

describe('getLlmLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no logs exist', async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] })

    const result = await getLlmLogs('podcast-1')

    expect(result.logs).toEqual([])
    expect(result.lastDoc).toBeNull()
  })

  it('returns logs ordered by createdAt desc', async () => {
    mockGet.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'log-1',
          data: () => ({
            ...validLogData,
            createdAt: { toDate: () => new Date('2026-02-26T16:00:00Z') },
          }),
        },
        {
          id: 'log-2',
          data: () => ({
            ...validLogData,
            component: 'adwords/generate',
            createdAt: { toDate: () => new Date('2026-02-26T15:00:00Z') },
          }),
        },
      ],
    })

    const result = await getLlmLogs('podcast-1')

    expect(result.logs).toHaveLength(2)
    expect(result.logs[0].id).toBe('log-1')
    expect(result.logs[1].id).toBe('log-2')
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc')
  })

  it('applies limit option', async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] })

    await getLlmLogs('podcast-1', { limit: 50 })

    expect(mockLimit).toHaveBeenCalledWith(50)
  })

  it('uses default limit of 100', async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] })

    await getLlmLogs('podcast-1')

    expect(mockLimit).toHaveBeenCalledWith(100)
  })

  it('serializes Firestore timestamps to ISO strings', async () => {
    mockGet.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'log-1',
          data: () => ({
            ...validLogData,
            createdAt: { toDate: () => new Date('2026-02-26T16:00:00.000Z') },
          }),
        },
      ],
    })

    const result = await getLlmLogs('podcast-1')

    expect(result.logs[0].createdAt).toBe('2026-02-26T16:00:00.000Z')
  })

  it('logs info after fetching', async () => {
    mockGet.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'log-1',
          data: () => ({ ...validLogData, createdAt: { toDate: () => new Date() } }),
        },
      ],
    })

    await getLlmLogs('podcast-1')

    expect(log).toHaveBeenCalledWith('INFO', 'LLM logs fetched', { podcastId: 'podcast-1', count: 1 })
  })
})
