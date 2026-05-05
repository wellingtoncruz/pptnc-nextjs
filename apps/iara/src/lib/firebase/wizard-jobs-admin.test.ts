import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- Mock setup ---
const mockSet = vi.fn()
const mockUpdate = vi.fn()
const mockJobDoc = vi.fn(() => ({ set: mockSet, update: mockUpdate, id: 'generated-job-id' }))
const mockJobsCollection = vi.fn(() => ({ doc: mockJobDoc }))
const mockVideoDoc = vi.fn(() => ({ collection: mockJobsCollection }))
const mockVideosCollection = vi.fn(() => ({ doc: mockVideoDoc }))
const mockPodcastDoc = vi.fn(() => ({ collection: mockVideosCollection }))

vi.mock('./admin', () => ({
  getAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({ doc: mockPodcastDoc })),
  })),
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

const mockNow = { toDate: () => new Date('2026-05-05T18:00:00Z') }
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => mockNow,
  },
}))

import { log } from '@/lib/logger'
import { createWizardJob, updateWizardJob } from './wizard-jobs-admin'

describe('createWizardJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSet.mockResolvedValue(undefined)
  })

  it('writes to videos/{videoId}/wizardJobs subcollection', async () => {
    await createWizardJob('podcast-1', { videoId: 'video-abc', phase: 2 })

    expect(mockPodcastDoc).toHaveBeenCalledWith('podcast-1')
    expect(mockVideosCollection).toHaveBeenCalledWith('videos')
    expect(mockVideoDoc).toHaveBeenCalledWith('video-abc')
    expect(mockJobsCollection).toHaveBeenCalledWith('wizardJobs')
  })

  it('persists pending status with timestamps', async () => {
    await createWizardJob('podcast-1', { videoId: 'video-abc', phase: 2 })

    expect(mockSet).toHaveBeenCalledWith({
      videoId: 'video-abc',
      phase: 2,
      status: 'pending',
      createdAt: mockNow,
      updatedAt: mockNow,
    })
  })

  it('persists optional context fields when provided', async () => {
    await createWizardJob('podcast-1', {
      videoId: 'video-abc',
      phase: 5,
      additionalContext: 'foco em IA',
      promptOverride: 'use o tom Y',
    })

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      additionalContext: 'foco em IA',
      promptOverride: 'use o tom Y',
    }))
  })

  it('returns the generated job id', async () => {
    const id = await createWizardJob('podcast-1', { videoId: 'video-abc', phase: 2 })
    expect(id).toBe('generated-job-id')
  })

  it('rejects invalid phase', async () => {
    await expect(
      createWizardJob('podcast-1', { videoId: 'video-abc', phase: 99 as never })
    ).rejects.toThrow()
  })

  it('rejects empty videoId', async () => {
    await expect(
      createWizardJob('podcast-1', { videoId: '', phase: 2 })
    ).rejects.toThrow()
  })

  it('logs success after creating', async () => {
    await createWizardJob('podcast-1', { videoId: 'video-abc', phase: 2 })

    expect(log).toHaveBeenCalledWith('INFO', 'Wizard job created', expect.objectContaining({
      videoId: 'video-abc',
      phase: 2,
    }))
  })
})

describe('updateWizardJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockResolvedValue(undefined)
  })

  it('updates the correct job document', async () => {
    await updateWizardJob('podcast-1', 'video-abc', 'job-xyz', { status: 'processing' })

    expect(mockJobDoc).toHaveBeenCalledWith('job-xyz')
    expect(mockUpdate).toHaveBeenCalledWith({
      status: 'processing',
      updatedAt: mockNow,
    })
  })

  it('persists result on complete', async () => {
    const result = { hasIssues: false, issues: [] }

    await updateWizardJob('podcast-1', 'video-abc', 'job-xyz', {
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
    await updateWizardJob('podcast-1', 'video-abc', 'job-xyz', {
      status: 'failed',
      error: { code: 'RATE_LIMIT', message: 'Limite excedido', retryable: true },
    })

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      error: { code: 'RATE_LIMIT', message: 'Limite excedido', retryable: true },
    }))
  })

  it('rejects invalid status', async () => {
    await expect(
      updateWizardJob('podcast-1', 'video-abc', 'job-xyz', {
        status: 'unknown' as never,
      })
    ).rejects.toThrow()
  })

  it('propagates Firestore write errors', async () => {
    mockUpdate.mockRejectedValue(new Error('Permission denied'))

    await expect(
      updateWizardJob('podcast-1', 'video-abc', 'job-xyz', { status: 'processing' })
    ).rejects.toThrow('Permission denied')
  })
})
