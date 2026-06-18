import { beforeEach, describe, expect, it, vi } from 'vitest'

// Trava de segurança (Epic 27 append): publicação final só em produção.
// IS_PRODUCTION=false → a rota deve retornar 403 ANTES de tocar vídeo/YouTube.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/firebase/config', () => ({ IS_PRODUCTION: false, PODCAST_ID: 'pptnc' }))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))
vi.mock('@/lib/firebase/videos-admin', () => ({ getVideoAdmin: vi.fn(), updateVideoAdmin: vi.fn() }))
vi.mock('@/lib/firebase/tokens', () => ({
  getUserTokensWithExpiry: vi.fn(),
  refreshUserToken: vi.fn(),
  TokenRefreshError: class extends Error {},
}))
vi.mock('@/lib/youtube', () => ({
  YouTubeClient: class {},
  YouTubeAPIError: class extends Error {},
}))

import { auth } from '@/lib/auth'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'

import { PUT } from './route'

const mockAuth = vi.mocked(auth)
const mockGetVideo = vi.mocked(getVideoAdmin)

const req = (body: unknown) => ({ json: async () => body }) as Parameters<typeof PUT>[0]
const ctx = (videoId: string) => ({ params: Promise.resolve({ videoId }) })

describe('PUT /api/youtube/videos/[videoId] — trava de ambiente', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as any)
  })

  it('returns 403 with the lock message when not in production', async () => {
    const res = await PUT(req({ title: 't', description: 'd', tags: ['x'] }), ctx('video-1'))

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error.code).toBe('ENV_NOT_AUTHORIZED')
    expect(json.error.message).toBe('Ambiente de testes, publicação final não autorizada')
    // Bloqueou ANTES de tocar o vídeo (não houve leitura/escrita).
    expect(mockGetVideo).not.toHaveBeenCalled()
  })

  it('still requires auth before the env check', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await PUT(req({ title: 't', description: 'd', tags: ['x'] }), ctx('video-1'))
    expect(res.status).toBe(401)
  })
})
