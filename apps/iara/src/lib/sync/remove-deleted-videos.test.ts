import { beforeEach, describe, expect, it, vi } from 'vitest'

const { docs, jobsByVideo, mockRecursiveDelete, mockDeleteImages, mockRelations } = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown> | null>(),
  jobsByVideo: new Map<string, Array<{ status: string }>>(),
  mockRecursiveDelete: vi.fn(),
  mockDeleteImages: vi.fn(),
  mockRelations: vi.fn(),
}))

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: () => ({
    recursiveDelete: mockRecursiveDelete,
    collection: () => ({
      doc: () => ({
        collection: (name: string) =>
          name === 'jobs'
            ? {
                where: (_f: string, _op: string, videoId: string) => ({
                  get: async () => ({
                    docs: (jobsByVideo.get(videoId) ?? []).map((j) => ({ get: (k: string) => (j as never)[k] })),
                  }),
                }),
              }
            : {
                doc: (id: string) => ({
                  id,
                  get: async () => {
                    const data = docs.get(id)
                    return { exists: data != null, get: (k: string) => data?.[k] }
                  },
                }),
              },
      }),
    }),
  }),
}))
vi.mock('@/lib/firebase/cloud-storage', () => ({ deleteAllVideoImages: mockDeleteImages }))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))
vi.mock('@/lib/wizard/video-relations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wizard/video-relations')>()
  return { ...actual, getVideoRelations: mockRelations }
})

import { removeVideosGoneFromYouTube } from './remove-deleted-videos'

const NONE = { parent: null, children: [] }

function run(existing: string[], onYoutube: string[], myChannels = ['UC-trends']) {
  const youtube = { listMyChannelIds: vi.fn().mockResolvedValue(myChannels) }
  const promise = removeVideosGoneFromYouTube({
    podcastId: 'trendsnews',
    channelId: 'UC-trends',
    youtube,
    existingIds: new Set(existing),
    youtubeIds: new Set(onYoutube),
  })
  return { promise, youtube }
}

describe('removeVideosGoneFromYouTube', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    docs.clear()
    jobsByVideo.clear()
    mockRelations.mockResolvedValue(NONE)
    mockDeleteImages.mockResolvedValue(0)
  })

  it('nada sumiu: nem consulta o canal (zero cota)', async () => {
    const { promise, youtube } = run(['a', 'b'], ['a', 'b', 'c'])
    expect(await promise).toEqual({ removed: [], skipped: [], pendingWrongAccount: 0 })
    expect(youtube.listMyChannelIds).not.toHaveBeenCalled()
  })

  it('apaga de vez o que sumiu: documento com subcoleções + arquivos do bucket', async () => {
    docs.set('gone', { title: 'Live apagada', status: 'new' })
    const { promise } = run(['a', 'gone'], ['a'])

    const result = await promise

    expect(result.removed).toEqual([{ id: 'gone', title: 'Live apagada' }])
    expect(mockRecursiveDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'gone' }))
    expect(mockDeleteImages).toHaveBeenCalledWith('gone')
  })

  // Decisão do Wellington: conta sem acesso não vê privado — nada sai.
  it('conta que não é a do canal: não remove nada e conta os pendentes', async () => {
    docs.set('gone', { title: 'X' })
    const { promise } = run(['gone', 'gone2'], [], ['UC-pessoal'])

    const result = await promise

    expect(result).toEqual({ removed: [], skipped: [], pendingWrongAccount: 2 })
    expect(mockRecursiveDelete).not.toHaveBeenCalled()
  })

  it('vídeo com vínculo fica e vai para o aviso', async () => {
    docs.set('ep', { title: 'Episódio com cortes' })
    mockRelations.mockResolvedValue({ parent: null, children: [{ id: 'c1', title: 'Corte' }] })
    const { promise } = run(['ep'], [])

    const result = await promise

    expect(result.skipped).toEqual([{ id: 'ep', title: 'Episódio com cortes', reason: 'linked' }])
    expect(mockRecursiveDelete).not.toHaveBeenCalled()
  })

  it.each(['processing', 'sending'])('vídeo em %s fica (busy)', async (status) => {
    docs.set('v', { title: 'V', status })
    const result = await run(['v'], []).promise
    expect(result.skipped[0].reason).toBe('busy')
    expect(mockRecursiveDelete).not.toHaveBeenCalled()
  })

  it('vídeo com job em andamento fica (busy); job concluído não segura', async () => {
    docs.set('v1', { title: 'V1' })
    docs.set('v2', { title: 'V2' })
    jobsByVideo.set('v1', [{ status: 'processing' }])
    jobsByVideo.set('v2', [{ status: 'complete' }])

    const result = await run(['v1', 'v2'], []).promise

    expect(result.skipped).toEqual([{ id: 'v1', title: 'V1', reason: 'busy' }])
    expect(result.removed).toEqual([{ id: 'v2', title: 'V2' }])
  })

  it('falha no bucket depois de apagar o documento ainda conta como removido', async () => {
    docs.set('gone', { title: 'G' })
    mockDeleteImages.mockRejectedValue(new Error('bucket'))
    const result = await run(['gone'], []).promise
    expect(result.removed).toHaveLength(1)
  })
})
