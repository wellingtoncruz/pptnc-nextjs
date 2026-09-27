import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/firebase/videos-admin', () => ({ getVideoAdmin: vi.fn() }))
vi.mock('@/lib/firebase/config', () => ({ PODCAST_ID: 'test-podcast-id' }))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))
vi.mock('@/lib/api/avulso-purge', () => ({ runAvulsoPurge: vi.fn() }))

import { auth } from '@/lib/auth'
import { runAvulsoPurge } from '@/lib/api/avulso-purge'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'

import { PUT } from './route'

const mockAuth = vi.mocked(auth)
const mockGetVideo = vi.mocked(getVideoAdmin)
const mockPurge = vi.mocked(runAvulsoPurge)

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/videos/v1/video-type', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const ctx = { params: Promise.resolve({ videoId: 'v1' }) }

describe('PUT /api/videos/[videoId]/video-type — reclassificação do avulso (adendo Epic 25)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } } as never)
  })

  it('401 sem sessão', async () => {
    mockAuth.mockResolvedValue(null as never)
    expect((await PUT(req({ videoType: 'episode' }), ctx)).status).toBe(401)
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('400 para tipo inválido', async () => {
    expect((await PUT(req({ videoType: 'live' }), ctx)).status).toBe(400)
  })

  // Por padrão o tipo vem da duração e é rígido: só o avulso destrava.
  it('409 quando o vídeo não é avulso — nada é espurgado', async () => {
    mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'cut', standalone: false } as never)
    const res = await PUT(req({ videoType: 'episode' }), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('NOT_STANDALONE')
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('400 quando o tipo já é o pedido — espurgar por nada apagaria trabalho', async () => {
    mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'cut', standalone: true } as never)
    const res = await PUT(req({ videoType: 'cut' }), ctx)
    expect(res.status).toBe(400)
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('reclassifica espurgando o wizard, com o vínculo de pai zerado na mesma escrita', async () => {
    const video = { id: 'v1', videoType: 'cut', standalone: true }
    mockGetVideo.mockResolvedValue(video as never)
    mockPurge.mockResolvedValue({ ok: true, imagesPurged: true })

    const res = await PUT(req({ videoType: 'episode' }), ctx)

    expect(res.status).toBe(200)
    expect(mockPurge).toHaveBeenCalledWith({
      podcastId: 'test-podcast-id',
      userId: 'user-1',
      video,
      patch: { videoType: 'episode', parentEpisodeId: '' },
    })
    expect((await res.json()).data).toEqual({ videoType: 'episode', imagesPurged: true })
  })

  it('recusa do espurgo volta como está (nada foi apagado)', async () => {
    mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'reel', standalone: true } as never)
    mockPurge.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: 'WIZARD_JOB_RUNNING' } }, { status: 409 }),
    })
    const res = await PUT(req({ videoType: 'episode' }), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('WIZARD_JOB_RUNNING')
  })
})
