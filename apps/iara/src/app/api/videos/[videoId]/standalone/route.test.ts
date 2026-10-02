import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mockTxUpdate, mockTxGet, mockAssertUnlinked } = vi.hoisted(() => ({
  mockTxUpdate: vi.fn(),
  mockTxGet: vi.fn(),
  mockAssertUnlinked: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/firebase/videos-admin', () => ({ getVideoAdmin: vi.fn() }))
vi.mock('@/lib/firebase/config', () => ({ PODCAST_ID: 'test-podcast-id' }))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))
vi.mock('@/lib/api/avulso-purge', () => ({ runAvulsoPurge: vi.fn() }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'NOW' } }))
vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: () => ({
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => 'VIDEO_REF' }) }) }),
    runTransaction: (fn: (tx: unknown) => Promise<void>) => fn({ get: mockTxGet, update: mockTxUpdate }),
  }),
}))
vi.mock('@/lib/wizard/video-relations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wizard/video-relations')>()
  return { ...actual, getVideoRelations: vi.fn(), assertUnlinkedInTx: mockAssertUnlinked }
})

import { auth } from '@/lib/auth'
import { runAvulsoPurge } from '@/lib/api/avulso-purge'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { getVideoRelations, VideoLinkedError } from '@/lib/wizard/video-relations'

import { PUT } from './route'

const mockAuth = vi.mocked(auth)
const mockGetVideo = vi.mocked(getVideoAdmin)
const mockRelations = vi.mocked(getVideoRelations)
const mockPurge = vi.mocked(runAvulsoPurge)

const NO_RELATIONS = { parent: null, children: [] }

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/videos/v1/standalone', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const ctx = { params: Promise.resolve({ videoId: 'v1' }) }

describe('PUT /api/videos/[videoId]/standalone (Epic 25, Adendo B)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } } as never)
    mockTxGet.mockResolvedValue({ get: () => 'draft' })
    mockAssertUnlinked.mockResolvedValue(undefined)
  })

  it('401 sem sessão', async () => {
    mockAuth.mockResolvedValue(null as never)
    expect((await PUT(req({ standalone: true }), ctx)).status).toBe(401)
  })

  it('400 sem standalone', async () => {
    expect((await PUT(req({}), ctx)).status).toBe(400)
  })

  // A régua não decide mais: desmarcar sem tipo escolhido é pedido inválido.
  it('400 ao desmarcar sem videoType', async () => {
    expect((await PUT(req({ standalone: false }), ctx)).status).toBe(400)
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('404 quando o vídeo não existe', async () => {
    mockGetVideo.mockResolvedValue(null as never)
    expect((await PUT(req({ standalone: true }), ctx)).status).toBe(404)
  })

  describe('marcar', () => {
    it.each(['episode', 'cut', 'reel'])('vale para %s sem vínculo — só liga a flag', async (videoType) => {
      mockGetVideo.mockResolvedValue({ id: 'v1', videoType, guests: [{ name: 'Ana' }], theme: 'T' } as never)
      mockRelations.mockResolvedValue(NO_RELATIONS)

      const res = await PUT(req({ standalone: true }), ctx)

      expect(res.status).toBe(200)
      expect(mockAssertUnlinked).toHaveBeenCalledWith(expect.anything(), 'test-podcast-id', 'v1')
      // Convidados/tema do vídeo ficam: sem pai, não são herança.
      expect(mockTxUpdate).toHaveBeenCalledWith('VIDEO_REF', { standalone: true, updatedAt: 'NOW' })
    })

    it('vídeo novo vira rascunho (mesmo auto-draft do updateVideoAdmin)', async () => {
      mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'cut' } as never)
      mockRelations.mockResolvedValue(NO_RELATIONS)
      mockTxGet.mockResolvedValue({ get: () => 'new' })

      await PUT(req({ standalone: true }), ctx)

      expect(mockTxUpdate).toHaveBeenCalledWith('VIDEO_REF', {
        standalone: true,
        status: 'draft',
        updatedAt: 'NOW',
      })
    })

    // Acabou o "marcar avulso apaga o pai": corte vinculado nunca vira avulso.
    it('409 para corte com pai — o vínculo vai em details e nada é escrito', async () => {
      const relations = { parent: { id: 'ep-1', title: 'Episódio 1', videoType: 'episode' }, children: [] }
      mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'cut', parentEpisodeId: 'ep-1' } as never)
      mockRelations.mockResolvedValue(relations)

      const res = await PUT(req({ standalone: true }), ctx)

      expect(res.status).toBe(409)
      const json = await res.json()
      expect(json.error.code).toBe('VIDEO_LINKED')
      expect(json.error.details).toEqual(relations)
      expect(mockTxUpdate).not.toHaveBeenCalled()
    })

    it('409 para episódio com filhos — lista os filhos', async () => {
      const relations = { parent: null, children: [{ id: 'c1', title: 'Corte 1', videoType: 'cut' }] }
      mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'episode' } as never)
      mockRelations.mockResolvedValue(relations)

      const res = await PUT(req({ standalone: true }), ctx)

      expect(res.status).toBe(409)
      expect((await res.json()).error.details.children).toHaveLength(1)
      expect(mockTxUpdate).not.toHaveBeenCalled()
    })

    it('409 quando outra aba vinculou no meio (trava da transação)', async () => {
      mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'episode' } as never)
      mockRelations.mockResolvedValue(NO_RELATIONS)
      mockAssertUnlinked.mockRejectedValue(new VideoLinkedError())

      const res = await PUT(req({ standalone: true }), ctx)

      expect(res.status).toBe(409)
      expect((await res.json()).error.code).toBe('VIDEO_LINKED')
      expect(mockTxUpdate).not.toHaveBeenCalled()
    })
  })

  describe('desmarcar', () => {
    it('usa o tipo ESCOLHIDO pelo produtor e espurga na mesma escrita', async () => {
      // Avulso de 10 min: pela régua seria corte, o produtor escolhe episódio.
      const video = { id: 'v1', videoType: 'cut', standalone: true, duration: 600 }
      mockGetVideo.mockResolvedValue(video as never)
      mockPurge.mockResolvedValue({ ok: true, imagesPurged: true })

      const res = await PUT(req({ standalone: false, videoType: 'episode' }), ctx)

      expect(res.status).toBe(200)
      expect(mockPurge).toHaveBeenCalledWith({
        podcastId: 'test-podcast-id',
        userId: 'user-1',
        video,
        patch: { standalone: false, videoType: 'episode' },
      })
      expect((await res.json()).data).toEqual({ standalone: false, videoType: 'episode', imagesPurged: true })
    })

    // Decisão do Wellington: espurga SEMPRE, mesmo mantendo o tipo.
    it('espurga mesmo quando o tipo escolhido é o atual', async () => {
      mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'episode', standalone: true } as never)
      mockPurge.mockResolvedValue({ ok: true, imagesPurged: true })

      const res = await PUT(req({ standalone: false, videoType: 'episode' }), ctx)

      expect(res.status).toBe(200)
      expect(mockPurge).toHaveBeenCalledTimes(1)
    })

    it('recusa do espurgo volta como está', async () => {
      mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'cut', standalone: true } as never)
      mockPurge.mockResolvedValue({
        ok: false,
        response: NextResponse.json({ error: { code: 'YOUTUBE_NOT_VISIBLE' } }, { status: 403 }),
      })

      expect((await PUT(req({ standalone: false, videoType: 'cut' }), ctx)).status).toBe(403)
    })

    it('desmarcar quem não é avulso é no-op (sem espurgo)', async () => {
      mockGetVideo.mockResolvedValue({ id: 'v1', videoType: 'cut', standalone: false } as never)

      const res = await PUT(req({ standalone: false, videoType: 'cut' }), ctx)

      expect(res.status).toBe(200)
      expect(mockPurge).not.toHaveBeenCalled()
    })
  })
})
