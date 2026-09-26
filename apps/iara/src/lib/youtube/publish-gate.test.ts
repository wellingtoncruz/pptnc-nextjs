import { beforeEach, describe, expect, it, vi } from 'vitest'

const { config, mockGetPodcast } = vi.hoisted(() => ({
  config: { IS_PRODUCTION: true, PODCAST_ID: 'trendsnews' },
  mockGetPodcast: vi.fn(),
}))

vi.mock('@/lib/firebase/config', () => config)
vi.mock('@/lib/firebase/podcasts-admin', () => ({ getPodcastAdmin: mockGetPodcast }))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { getYoutubePublishGate } from './publish-gate'

const podcast = (features?: Record<string, boolean>) => ({ id: 'trendsnews', name: 'TrenDs News', features })

describe('getYoutubePublishGate — PRD E features.youtubePublish', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.IS_PRODUCTION = true
  })

  it('fora de PRD bloqueia sem nem ler o podcast (a chave de infra vem antes)', async () => {
    config.IS_PRODUCTION = false
    mockGetPodcast.mockResolvedValue(podcast({ youtubePublish: true }))

    expect(await getYoutubePublishGate()).toEqual({
      allowed: false,
      code: 'ENV_NOT_AUTHORIZED',
      message: 'Ambiente de testes, publicação final não autorizada',
    })
    expect(mockGetPodcast).not.toHaveBeenCalled()
  })

  it('PRD com a flag ligada libera', async () => {
    mockGetPodcast.mockResolvedValue(podcast({ youtubePublish: true }))
    expect(await getYoutubePublishGate()).toEqual({ allowed: true })
    expect(mockGetPodcast).toHaveBeenCalledWith('trendsnews')
  })

  it('PRD com a flag desligada pelo admin bloqueia, e diz onde religar', async () => {
    mockGetPodcast.mockResolvedValue(podcast({ youtubePublish: false }))
    const gate = await getYoutubePublishGate()
    expect(gate).toMatchObject({ allowed: false, code: 'PUBLISH_DISABLED' })
    expect(gate.allowed === false && gate.message).toMatch(/Configurações/)
  })

  // O PPTNC publicava antes da flag existir: sem o campo no banco, segue
  // publicando — ninguém precisa tocar em PROD para a tag subir.
  it('campo ausente (podcast anterior à flag) libera', async () => {
    mockGetPodcast.mockResolvedValue(podcast({ editorial: true }))
    expect(await getYoutubePublishGate()).toEqual({ allowed: true })

    mockGetPodcast.mockResolvedValue(podcast(undefined))
    expect(await getYoutubePublishGate()).toEqual({ allowed: true })
  })

  it('falha FECHADA: podcast inexistente ou erro de leitura bloqueia', async () => {
    mockGetPodcast.mockResolvedValue(null)
    expect((await getYoutubePublishGate()).allowed).toBe(false)

    mockGetPodcast.mockRejectedValue(new Error('firestore down'))
    expect((await getYoutubePublishGate()).allowed).toBe(false)
  })
})
