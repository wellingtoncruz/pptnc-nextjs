import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock setup (coleção top-level podcasts/{id}/jobs) ---
const mockSet = vi.fn()
const mockUpdate = vi.fn()
const mockGet = vi.fn()
const mockJobDoc = vi.fn(() => ({ set: mockSet, update: mockUpdate, get: mockGet, id: 'generated-job-id' }))
const mockJobsCollection = vi.fn(() => ({ doc: mockJobDoc }))
const mockPodcastDoc = vi.fn(() => ({ collection: mockJobsCollection }))

vi.mock('./admin', () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({ doc: mockPodcastDoc })),
  })),
}))

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

const mockNow = { toDate: () => new Date('2026-06-09T18:00:00Z') }
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: () => mockNow },
}))

import { log } from '@/lib/logger'
import { createJob, getJob, updateJob } from './jobs-admin'

describe('createJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSet.mockResolvedValue(undefined)
  })

  it('writes to the top-level podcasts/{id}/jobs collection', async () => {
    await createJob('podcast-1', { type: 'social-post' })

    expect(mockPodcastDoc).toHaveBeenCalledWith('podcast-1')
    expect(mockJobsCollection).toHaveBeenCalledWith('jobs')
  })

  it('persists pending status with timestamps', async () => {
    await createJob('podcast-1', { type: 'adwords' })

    expect(mockSet).toHaveBeenCalledWith({
      type: 'adwords',
      status: 'pending',
      createdAt: mockNow,
      updatedAt: mockNow,
    })
  })

  it('persists optional context when provided', async () => {
    await createJob('podcast-1', { type: 'social-post', context: { videoId: 'v1', networkId: 'linkedin' } })

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      context: { videoId: 'v1', networkId: 'linkedin' },
    }))
  })

  it('returns the generated job id', async () => {
    const id = await createJob('podcast-1', { type: 'social-post' })
    expect(id).toBe('generated-job-id')
  })

  it('rejects empty type', async () => {
    await expect(createJob('podcast-1', { type: '' })).rejects.toThrow()
  })

  it('logs success after creating', async () => {
    await createJob('podcast-1', { type: 'social-post' })
    expect(log).toHaveBeenCalledWith('INFO', 'Job created', expect.objectContaining({ type: 'social-post' }))
  })
})

describe('updateJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockResolvedValue(undefined)
  })

  it('updates the correct job document with updatedAt', async () => {
    await updateJob('podcast-1', 'job-xyz', { status: 'processing' })

    expect(mockJobDoc).toHaveBeenCalledWith('job-xyz')
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'processing', updatedAt: mockNow })
  })

  it('persists result + usage on complete', async () => {
    const result = { cta: 'Confira', body: 'texto', hashtags: ['#a'] }
    await updateJob('podcast-1', 'job-xyz', {
      status: 'complete',
      result,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'complete',
      result,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    }))
  })

  it('persists error on failed', async () => {
    await updateJob('podcast-1', 'job-xyz', {
      status: 'failed',
      error: { code: 'RATE_LIMIT', message: 'Limite', retryable: true },
    })

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      error: { code: 'RATE_LIMIT', message: 'Limite', retryable: true },
    }))
  })

  it('strips undefined fields before writing (Firestore rejeita undefined)', async () => {
    await updateJob('podcast-1', 'job-xyz', { status: 'complete', result: { thumbnailUrl: 'u' }, usage: undefined })

    const written = mockUpdate.mock.calls[0][0]
    expect(written).not.toHaveProperty('usage')
    expect(written).toEqual({ status: 'complete', result: { thumbnailUrl: 'u' }, updatedAt: mockNow })
  })

  it('rejects invalid status', async () => {
    await expect(updateJob('podcast-1', 'job-xyz', { status: 'unknown' as never })).rejects.toThrow()
  })

  it('propagates Firestore write errors', async () => {
    mockUpdate.mockRejectedValue(new Error('Permission denied'))
    await expect(updateJob('podcast-1', 'job-xyz', { status: 'processing' })).rejects.toThrow('Permission denied')
  })
})

describe('getJob', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the job with its id when it exists', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      id: 'job-xyz',
      data: () => ({ type: 'social-post', status: 'complete', result: { ok: true } }),
    })

    const job = await getJob('podcast-1', 'job-xyz')
    expect(job).toEqual({ id: 'job-xyz', type: 'social-post', status: 'complete', result: { ok: true } })
  })

  it('returns null when the job does not exist', async () => {
    mockGet.mockResolvedValue({ exists: false })
    expect(await getJob('podcast-1', 'missing')).toBeNull()
  })
})
