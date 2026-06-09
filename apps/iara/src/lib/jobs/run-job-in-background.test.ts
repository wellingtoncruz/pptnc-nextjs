import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/jobs-admin', () => ({ updateJob: vi.fn() }))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { updateJob } from '@/lib/firebase/jobs-admin'
import { LLMError } from '@/lib/llm/errors'

import { runJobInBackground } from './run-job-in-background'

const mockUpdateJob = vi.mocked(updateJob)

describe('runJobInBackground', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateJob.mockResolvedValue(undefined)
  })

  it('transitions processing → complete with result + usage on success', async () => {
    const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    await runJobInBackground('podcast-1', 'job-1', async () => ({ result: { ok: true }, usage }))

    expect(mockUpdateJob).toHaveBeenNthCalledWith(1, 'podcast-1', 'job-1', { status: 'processing' })
    expect(mockUpdateJob).toHaveBeenNthCalledWith(2, 'podcast-1', 'job-1', {
      status: 'complete',
      result: { ok: true },
      usage,
    })
  })

  it('maps a thrown LLMError to the job failed state', async () => {
    await runJobInBackground('podcast-1', 'job-1', async () => {
      throw new LLMError('RATE_LIMIT', 'Limite excedido', true)
    })

    expect(mockUpdateJob).toHaveBeenLastCalledWith('podcast-1', 'job-1', {
      status: 'failed',
      error: { code: 'RATE_LIMIT', message: 'Limite excedido', retryable: true },
    })
  })

  it('maps a generic thrown error to a failed state with a code', async () => {
    await runJobInBackground('podcast-1', 'job-1', async () => {
      throw new Error('boom')
    })

    const lastCall = mockUpdateJob.mock.calls.at(-1)
    expect(lastCall?.[2]).toMatchObject({ status: 'failed' })
    expect((lastCall?.[2] as { error: { code: string } }).error.code).toBeTruthy()
  })

  it('does not throw if marking the job as failed also fails', async () => {
    mockUpdateJob
      .mockResolvedValueOnce(undefined) // processing
      .mockRejectedValueOnce(new Error('llm down')) // work? no — this is the processing update
    // Force the work to throw, and the failed-update to throw too.
    mockUpdateJob.mockReset()
    mockUpdateJob
      .mockResolvedValueOnce(undefined) // processing ok
      .mockRejectedValueOnce(new Error('firestore down')) // failed update throws

    await expect(
      runJobInBackground('podcast-1', 'job-1', async () => {
        throw new LLMError('API_ERROR', 'falhou', false)
      })
    ).resolves.toBeUndefined()
  })
})
