import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./poll-job', () => ({ pollJob: vi.fn() }))

import { pollJob } from './poll-job'
import { runAsyncJob } from './run-async-job'

const mockPollJob = vi.mocked(pollJob)

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response
}

describe('runAsyncJob', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('POSTs with ?mode=async and returns the polled result', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ jobId: 'job-1' }))
    mockPollJob.mockResolvedValue({ status: 'complete', result: { cta: 'x' } })

    const result = await runAsyncJob<{ cta: string }>({ url: '/api/videos/v1/social-posts/linkedin/generate', body: { foo: 1 } })

    expect(result).toEqual({ cta: 'x' })
    expect(fetch).toHaveBeenCalledWith(
      '/api/videos/v1/social-posts/linkedin/generate?mode=async',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ foo: 1 }) })
    )
    expect(mockPollJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1' }))
  })

  it('uses & as separator when the url already has a query', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ jobId: 'job-1' }))
    mockPollJob.mockResolvedValue({ status: 'complete', result: null })

    await runAsyncJob({ url: '/api/x?already=1' })
    expect(fetch).toHaveBeenCalledWith('/api/x?already=1&mode=async', expect.anything())
  })

  it('throws when the POST fails', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: { message: 'falha ao iniciar' } }, false, 500))
    await expect(runAsyncJob({ url: '/api/x' })).rejects.toThrow('falha ao iniciar')
  })

  it('throws when the job fails', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ jobId: 'job-1' }))
    mockPollJob.mockResolvedValue({ status: 'failed', error: { code: 'API_ERROR', message: 'deu ruim' } })
    await expect(runAsyncJob({ url: '/api/x' })).rejects.toThrow('deu ruim')
  })
})
