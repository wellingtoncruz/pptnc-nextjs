import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/firebase/config', () => ({ ENVIRONMENT: 'DEV', IS_PRODUCTION: false }))
vi.mock('@/lib/youtube/publish-gate', () => ({ getYoutubePublishGate: vi.fn() }))

import { auth } from '@/lib/auth'
import { getYoutubePublishGate } from '@/lib/youtube/publish-gate'
import { GET } from './route'

const mockAuth = vi.mocked(auth)
const mockGate = vi.mocked(getYoutubePublishGate)

describe('GET /api/environment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns environment + publishAllowed=false in DEV, with the reason', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue({ user: { email: 'x@y.com' } } as any)
    mockGate.mockResolvedValue({ allowed: false, code: 'ENV_NOT_AUTHORIZED', message: 'Ambiente de testes' })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { environment: 'DEV', publishAllowed: false, publishBlockedReason: 'Ambiente de testes' },
    })
  })

  it('publishAllowed=true and no reason when the gate is open', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue({ user: { email: 'x@y.com' } } as any)
    mockGate.mockResolvedValue({ allowed: true })
    const res = await GET()
    const json = await res.json()
    expect(json.data.publishAllowed).toBe(true)
    expect(json.data.publishBlockedReason).toBeNull()
  })
})
