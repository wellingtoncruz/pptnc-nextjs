import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pollJob } from './poll-job'

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

describe('pollJob', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns complete with result on the first poll', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 'complete', result: { ok: true }, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }))

    const result = await pollJob({ jobId: 'job-1' })
    expect(result).toEqual({ status: 'complete', result: { ok: true }, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } })
    expect(fetch).toHaveBeenCalledWith('/api/jobs/job-1', expect.anything())
  })

  it('polls until the job reaches a terminal status', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ status: 'pending' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'processing' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'complete', result: 42 }))

    const promise = pollJob({ jobId: 'job-1', intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(2000)
    expect(await promise).toEqual({ status: 'complete', result: 42, usage: undefined })
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('returns failed with the error payload', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ status: 'failed', error: { code: 'API_ERROR', message: 'falhou' } }))
    expect(await pollJob({ jobId: 'job-1' })).toEqual({ status: 'failed', error: { code: 'API_ERROR', message: 'falhou' } })
  })

  it('throws on a non-ok HTTP response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: { message: 'Job não encontrado' } }, false, 404))
    await expect(pollJob({ jobId: 'job-1' })).rejects.toThrow('Job não encontrado')
  })

  it('throws AbortError when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(pollJob({ jobId: 'job-1', signal: controller.signal })).rejects.toThrow('Aborted')
  })
})
