import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockJobsGet, mockVideoUpdate, mockLegacyGet, mockDeleteImages, mockTxUpdate } = vi.hoisted(() => ({
  mockTxUpdate: vi.fn(),
  mockJobsGet: vi.fn(),
  mockVideoUpdate: vi.fn(),
  mockLegacyGet: vi.fn(),
  mockDeleteImages: vi.fn(),
}))

vi.mock('@/lib/firebase/admin', () => ({
  getAdminDb: () => ({
    runTransaction: (fn: (tx: unknown) => Promise<void>) => fn({ update: mockTxUpdate }),
    collection: () => ({
      doc: () => ({
        collection: (name: string) =>
          name === 'jobs'
            ? { where: () => ({ get: mockJobsGet }) }
            : {
                doc: () => ({
                  update: mockVideoUpdate,
                  collection: () => ({ get: mockLegacyGet }),
                }),
              },
      }),
    }),
  }),
}))
vi.mock('@/lib/firebase/cloud-storage', () => ({ deleteVideoWizardImages: mockDeleteImages }))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => 'DELETE', serverTimestamp: () => 'NOW' },
}))

import type { Video } from '@/types/video'

import { purgeWizardData, WIZARD_GENERATED_FIELDS, WizardPurgeBlockedError } from './purge-wizard-data'

const ON_YOUTUBE = {
  title: 'Título que está no YouTube',
  description: 'Descrição do YouTube',
  tags: ['tag-yt'],
  channelId: 'UC-trends',
}

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: 'v1',
    status: 'draft',
    title: 'Título gerado pela IA',
    storageThumbnailUrl: '/api/wizard/thumbnail/select?path=thumbnails%2Fx%2Fv1%2Ffinal.png',
    ...overrides,
  } as unknown as Video
}

function run(v: Video, youtube = { getVideoMetadata: vi.fn().mockResolvedValue(ON_YOUTUBE) }) {
  return purgeWizardData({
    podcastId: 'trendsnews',
    channelId: 'UC-trends',
    video: v,
    youtube,
    patch: { videoType: 'episode', parentEpisodeId: '' },
  })
}

describe('purgeWizardData — adendo do Epic 25', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJobsGet.mockResolvedValue({ docs: [] })
    mockLegacyGet.mockResolvedValue({ docs: [] })
    mockDeleteImages.mockResolvedValue(3)
  })

  it('restaura título/descrição/tags DO YOUTUBE e apaga tudo o que o wizard gerou, com o patch na mesma escrita', async () => {
    const result = await run(video())

    expect(result).toEqual({ imagesPurged: true })
    expect(mockVideoUpdate).toHaveBeenCalledTimes(1)
    const update = mockVideoUpdate.mock.calls[0][0]
    expect(update).toMatchObject({
      title: ON_YOUTUBE.title,
      description: ON_YOUTUBE.description,
      tags: ON_YOUTUBE.tags,
      videoType: 'episode',
      parentEpisodeId: '',
      storageThumbnailUrl: 'DELETE',
    })
    for (const field of WIZARD_GENERATED_FIELDS) expect(update[field]).toBe('DELETE')
    expect(mockDeleteImages).toHaveBeenCalledWith('v1')
  })

  it('não toca no que não é do wizard (transcrição, tópicos, convidados, embedding)', async () => {
    await run(video())
    const update = mockVideoUpdate.mock.calls[0][0]
    for (const kept of ['transcriptionSRT', 'transcriptionTXT', 'topics', 'guests', 'hasEmbedding', 'duration']) {
      expect(update).not.toHaveProperty(kept)
    }
  })

  it('thumbnail que veio do sync (não é do proxy do wizard) sobrevive', async () => {
    await run(video({ storageThumbnailUrl: 'https://storage.googleapis.com/b/thumb.jpg' }))
    expect(mockVideoUpdate.mock.calls[0][0]).not.toHaveProperty('storageThumbnailUrl')
  })

  it('ready volta a draft (recomeçar é editar); sent continua sent', async () => {
    await run(video({ status: 'ready' }))
    expect(mockVideoUpdate.mock.calls[0][0].status).toBe('draft')

    mockVideoUpdate.mockClear()
    await run(video({ status: 'sent' }))
    expect(mockVideoUpdate.mock.calls[0][0]).not.toHaveProperty('status')
  })

  it('apaga os resíduos de wizardJobs do vídeo', async () => {
    const del = vi.fn()
    mockLegacyGet.mockResolvedValue({ docs: [{ ref: { delete: del } }, { ref: { delete: del } }] })
    await run(video())
    expect(del).toHaveBeenCalledTimes(2)
  })

  it('falha no bucket não desfaz o documento — volta imagesPurged:false', async () => {
    mockDeleteImages.mockRejectedValue(new Error('bucket down'))
    expect(await run(video())).toEqual({ imagesPurged: false })
    expect(mockVideoUpdate).toHaveBeenCalledTimes(1)
  })

  describe('recusa INTEIRO, sem apagar nada', () => {
    async function expectRefused(promise: Promise<unknown>, code: string) {
      await expect(promise).rejects.toBeInstanceOf(WizardPurgeBlockedError)
      await expect(promise).rejects.toMatchObject({ code })
      expect(mockVideoUpdate).not.toHaveBeenCalled()
      expect(mockDeleteImages).not.toHaveBeenCalled()
    }

    it('com geração do wizard em andamento (um job atrasado regravaria o campo)', async () => {
      mockJobsGet.mockResolvedValue({
        docs: [
          { data: () => ({ type: 'newsletter-draft', status: 'processing' }) },
          { data: () => ({ type: 'wizard:critique', status: 'processing' }) },
        ],
      })
      await expectRefused(run(video()), 'WIZARD_JOB_RUNNING')
    })

    it('job do wizard já concluído não bloqueia', async () => {
      mockJobsGet.mockResolvedValue({ docs: [{ data: () => ({ type: 'wizard:critique', status: 'complete' }) }] })
      await expect(run(video())).resolves.toEqual({ imagesPurged: true })
    })

    it('com o vídeo em processamento ou sendo publicado', async () => {
      await expectRefused(run(video({ status: 'sending' })), 'VIDEO_BUSY')
      await expectRefused(run(video({ status: 'processing' })), 'VIDEO_BUSY')
    })

    it('quando o YouTube não devolve o vídeo para a conta logada', async () => {
      await expectRefused(
        run(video(), { getVideoMetadata: vi.fn().mockResolvedValue(null) }),
        'YOUTUBE_NOT_VISIBLE'
      )
    })

    it('quando o vídeo é de outro canal', async () => {
      await expectRefused(
        run(video(), { getVideoMetadata: vi.fn().mockResolvedValue({ ...ON_YOUTUBE, channelId: 'UC-outro' }) }),
        'WRONG_CHANNEL'
      )
    })
  })
})

describe('purgeWizardData — trava de vínculo na escrita (Adendo B)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJobsGet.mockResolvedValue({ docs: [] })
    mockLegacyGet.mockResolvedValue({ docs: [] })
    mockDeleteImages.mockResolvedValue(undefined)
  })

  const youtube = () => ({ getVideoMetadata: vi.fn().mockResolvedValue(ON_YOUTUBE) })

  it('com guard, escreve dentro da transação depois da checagem', async () => {
    const guard = vi.fn().mockResolvedValue(undefined)
    await purgeWizardData({
      podcastId: 'trendsnews',
      channelId: 'UC-trends',
      video: video(),
      youtube: youtube(),
      patch: { videoType: 'cut' },
      guard,
    })
    expect(guard).toHaveBeenCalledTimes(1)
    expect(mockTxUpdate).toHaveBeenCalledTimes(1)
    expect(mockVideoUpdate).not.toHaveBeenCalled()
  })

  it('guard que recusa: nada é escrito nem apagado', async () => {
    const guard = vi.fn().mockRejectedValue(new Error('linked'))
    await expect(
      purgeWizardData({
        podcastId: 'trendsnews',
        channelId: 'UC-trends',
        video: video(),
        youtube: youtube(),
        patch: { videoType: 'cut' },
        guard,
      })
    ).rejects.toThrow('linked')
    expect(mockTxUpdate).not.toHaveBeenCalled()
    expect(mockVideoUpdate).not.toHaveBeenCalled()
    expect(mockDeleteImages).not.toHaveBeenCalled()
  })
})
