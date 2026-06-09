import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/firebase/config', () => ({ PODCAST_ID: 'pptnc' }))
vi.mock('@/lib/firebase/jobs-admin', () => ({ getJob: vi.fn() }))

import { auth } from '@/lib/auth'
import { getJob } from '@/lib/firebase/jobs-admin'

import { GET } from './route'

const mockAuth = vi.mocked(auth)
const mockGetJob = vi.mocked(getJob)

const req = {} as Parameters<typeof GET>[0]
const ctx = (jobId: string) => ({ params: Promise.resolve({ jobId }) })

describe('GET /api/jobs/[jobId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue({ user: { email: 'x@y.com' } } as any)
  })

  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(req, ctx('job-1'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when the job does not exist', async () => {
    mockGetJob.mockResolvedValue(null)
    const res = await GET(req, ctx('missing'))
    expect(res.status).toBe(404)
    expect(mockGetJob).toHaveBeenCalledWith('pptnc', 'missing')
  })

  it('returns the job snapshot (status/result/error/usage) when complete', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-1',
      type: 'social-post',
      status: 'complete',
      result: { cta: 'Confira' },
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const res = await GET(req, ctx('job-1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'complete',
      result: { cta: 'Confira' },
      error: undefined,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    })
  })

  it('returns 400 for an empty jobId', async () => {
    const res = await GET(req, ctx(''))
    expect(res.status).toBe(400)
  })
})
