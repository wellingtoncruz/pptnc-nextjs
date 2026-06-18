import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/firebase/config', () => ({ ENVIRONMENT: 'DEV', IS_PRODUCTION: false }))

import { auth } from '@/lib/auth'
import { GET } from './route'

const mockAuth = vi.mocked(auth)

describe('GET /api/environment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns environment + publishAllowed=false in DEV', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue({ user: { email: 'x@y.com' } } as any)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { environment: 'DEV', publishAllowed: false } })
  })
})
