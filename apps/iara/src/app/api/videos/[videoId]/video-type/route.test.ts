import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/firebase/videos-admin', () => ({ getVideoAdmin: vi.fn() }))
vi.mock('@/lib/firebase/config', () => ({ PODCAST_ID: 'test-podcast-id' }))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))
vi.mock('@/lib/api/avulso-purge', () => ({ runAvulsoPurge: vi.fn() }))
vi.mock('@/lib/wizard/video-relations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wizard/video-relations')>()
  return { ...actual, getVideoRelations: vi.fn(), assertUnlinkedInTx: vi.fn() }
})

import { auth } from '@/lib/auth'
import { runAvulsoPurge } from '@/lib/api/avulso-purge'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { assertUnlinkedInTx, getVideoRelations } from '@/lib/wizard/video-relations'

import { PUT } from './route'

const mockAuth = vi.mocked(auth)
const mockGetVideo = vi.mocked(getVideoAdmin)
const mockPurge = vi.mocked(runAvulsoPurge)
const mockRelations = vi.mocked(getVideoRelations)
const mockAssertUnlinked = vi.mocked(assertUnlinkedInTx)
const NO_RELATIONS = { parent: null, children: [] }

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/videos/v1/video-type', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const ctx = { params: Promise.resolve({ videoId: 'v1' }) }

describe('PUT /api/videos/[videoId]/video-type — reclassificação (Epic 25, Adendos A e B)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockRelations.mockResolvedValue(NO_RELATIONS)
  })

  it('401 sem sessão', async () => {
    mockAuth.mockResolvedValue(null as never)
    expect((await PUT(req({ videoType: 'episode' }), ctx)).status).toBe(401)
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('400 para tipo inválido', async () => {
    expect((await PUT(req({ videoType: 'live' }), ctx)).status).toBe(400)
  })

  // Adendo B: o vínculo prova que o tipo está certo — vídeo vinculado não reclassifica.
  it('409 VIDEO_LINKED para corte com pai — nada é espurgado', async () => {
    const relations = { parent: { id: 'ep-1', title: 'Ep 1' }, children: [] }
    mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'cut', standalone: false, parentEpisodeId: 'ep-1' } as never)
    mockRelations.mockResolvedValue(relations)
    const res = await PUT(req({ videoType: 'episode' }), ctx)
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error.code).toBe('VIDEO_LINKED')
    expect(json.error.details).toEqual(relations)
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('409 VIDEO_LINKED para episódio com filhos', async () => {
    mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'episode', standalone: false } as never)
    mockRelations.mockResolvedValue({ parent: null, children: [{ id: 'c1', title: 'Corte' }] })
    expect((await PUT(req({ videoType: 'cut' }), ctx)).status).toBe(409)
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('vídeo comum SEM vínculo reclassifica, sem virar avulso, com trava na escrita', async () => {
    const video = { id: 'v1', videoType: 'episode', standalone: false }
    mockGetVideo.mockResolvedValue(video as never)
    mockPurge.mockResolvedValue({ ok: true, imagesPurged: true })

    const res = await PUT(req({ videoType: 'cut' }), ctx)

    expect(res.status).toBe(200)
    const call = mockPurge.mock.calls[0][0]
    expect(call.patch).toEqual({ videoType: 'cut' })
    expect(call.guard).toBeTypeOf('function')
    await call.guard!('TX' as never)
    expect(mockAssertUnlinked).toHaveBeenCalledWith('TX', 'test-podcast-id', 'v1')
  })

  it('400 quando o tipo já é o pedido — espurgar por nada apagaria trabalho', async () => {
    mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'cut', standalone: true } as never)
    const res = await PUT(req({ videoType: 'cut' }), ctx)
    expect(res.status).toBe(400)
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('avulso reclassifica sempre (é elegível por construção), sem trava extra', async () => {
    const video = { id: 'v1', videoType: 'cut', standalone: true }
    mockGetVideo.mockResolvedValue(video as never)
    mockPurge.mockResolvedValue({ ok: true, imagesPurged: true })

    const res = await PUT(req({ videoType: 'episode' }), ctx)

    expect(res.status).toBe(200)
    expect(mockPurge).toHaveBeenCalledWith({
      podcastId: 'test-podcast-id',
      userId: 'user-1',
      video,
      patch: { videoType: 'episode' },
      guard: undefined,
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
