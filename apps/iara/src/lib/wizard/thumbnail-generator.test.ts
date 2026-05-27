/**
 * Tests para o gerador de thumbnail — Epic 22 / Story 22.4.
 *
 * Cobertura:
 * - `buildThumbnailPrompt`: composição do prompt + interpolação de placeholders + observação opcional
 * - `generateThumbnail`: orquestração feliz + RATE_LIMIT com retry/backoff (com setTimeout mockado)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCallGenAIImage = vi.fn()
const mockUploadThumbnailStagingImage = vi.fn()

vi.mock('@/lib/llm/image-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/llm/image-client')>('@/lib/llm/image-client')
  return {
    ...actual,
    callGenAIImage: (...args: unknown[]) => mockCallGenAIImage(...args),
  }
})

vi.mock('@/lib/firebase/cloud-storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/firebase/cloud-storage')>('@/lib/firebase/cloud-storage')
  return {
    ...actual,
    uploadThumbnailStagingImage: (...args: unknown[]) => mockUploadThumbnailStagingImage(...args),
  }
})

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
  NEWSLETTER_IMAGES_BUCKET: 'iara-images',
}))

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { LLMError } from '@/lib/llm/errors'

import { buildThumbnailPrompt, generateThumbnail } from './thumbnail-generator'

const baseVideo = {
  id: 'video-1',
  videoType: 'episode',
  title: 'Por que Rust é melhor que C',
} as never

const basePodcast = {
  id: 'pptnc',
  name: 'PPT Não Compila',
  prompts: {
    episode: {
      thumbnail: {
        description: 'Thumbnail do episódio {{video.title}} com identidade do podcast.',
        expectedOutput: 'PNG 1280x720',
        baseImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config%2Fpptnc%2Fepisode%2Fbase.png',
        baseImageMimeType: 'image/png',
        referenceImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config%2Fpptnc%2Fepisode%2Fref.jpg',
        referenceImageMimeType: 'image/jpeg',
      },
    },
  },
} as never

describe('buildThumbnailPrompt', () => {
  it('interpolates {{video.field}} placeholders in description', () => {
    const prompt = buildThumbnailPrompt(
      {
        description: 'Crie thumbnail para {{video.title}}',
        expectedOutput: 'PNG',
      },
      { id: 'v', title: 'Meu Episódio' } as never,
      undefined
    )
    expect(prompt).toContain('Crie thumbnail para Meu Episódio')
    expect(prompt).toContain('Saída esperada:\nPNG')
  })

  it('appends the producer observation as a priority instruction', () => {
    const prompt = buildThumbnailPrompt(
      { description: 'X', expectedOutput: 'Y' },
      { id: 'v', title: 'Z' } as never,
      '  destaque o convidado  '
    )
    expect(prompt).toContain('INSTRUÇÃO PRIORITÁRIA DO PRODUTOR')
    expect(prompt).toContain('destaque o convidado')
  })

  it('for cut videos, {{video.title}} resolves to shortTitle (the short title selected in phase 5B)', () => {
    const prompt = buildThumbnailPrompt(
      { description: 'Corte do episódio {{video.title}}', expectedOutput: 'PNG' },
      {
        id: 'c1',
        videoType: 'cut',
        title: 'Por que Rust é melhor que C — episódio longo',
        shortTitle: 'Rust > C',
      } as never,
      undefined
    )
    expect(prompt).toContain('Corte do episódio Rust > C')
    expect(prompt).not.toContain('episódio longo')
  })

  it('for cut videos without shortTitle, falls back to the long title', () => {
    const prompt = buildThumbnailPrompt(
      { description: '{{video.title}}', expectedOutput: 'PNG' },
      { id: 'c1', videoType: 'cut', title: 'Título longo', shortTitle: '   ' } as never,
      undefined
    )
    expect(prompt).toContain('Título longo')
  })

  it('for episode videos, {{video.title}} keeps using the canonical title (no shortTitle override)', () => {
    const prompt = buildThumbnailPrompt(
      { description: '{{video.title}}', expectedOutput: 'PNG' },
      {
        id: 'e1',
        videoType: 'episode',
        title: 'Episódio canônico',
        // shortTitle não deve influenciar pra episodes mesmo se presente por algum motivo.
        shortTitle: 'IGNORAR',
      } as never,
      undefined
    )
    expect(prompt).toContain('Episódio canônico')
    expect(prompt).not.toContain('IGNORAR')
  })

  it('omits the observation block when empty/whitespace', () => {
    const prompt = buildThumbnailPrompt(
      { description: 'X', expectedOutput: 'Y' },
      { id: 'v', title: 'Z' } as never,
      '   '
    )
    expect(prompt).not.toContain('INSTRUÇÃO PRIORITÁRIA')
  })
})

describe('generateThumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCallGenAIImage.mockResolvedValue({
      imageBuffer: Buffer.from('image-bytes'),
      mimeType: 'image/png',
    })
    mockUploadThumbnailStagingImage.mockResolvedValue({
      filePath: 'thumbnail-staging/pptnc/video-1/gen-123.png',
      mimeType: 'image/png',
    })
  })

  it('throws when the thumbnail config is missing description or expectedOutput', async () => {
    const podcast = {
      ...basePodcast,
      prompts: { episode: { thumbnail: {} } },
    } as never
    await expect(
      generateThumbnail({ video: baseVideo, podcast, observation: undefined })
    ).rejects.toThrow(/incompleta/i)
  })

  it('throws when video type is not episode/cut', async () => {
    const video = { ...baseVideo, videoType: 'reel' } as never
    await expect(
      generateThumbnail({ video, podcast: basePodcast, observation: undefined })
    ).rejects.toThrow(/episódios e cortes/)
  })

  it('standalone (Epic 25): uses the standalone thumbnail config, not the cut bucket', async () => {
    const video = { id: 'video-1', videoType: 'cut', standalone: true, title: 'Notícia X' } as never
    const podcast = {
      ...basePodcast,
      prompts: {
        cut: {
          thumbnail: {
            description: 'Thumbnail de CORTE do podcast',
            expectedOutput: 'PNG 1280x720',
            baseImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config%2Fpptnc%2Fcut%2Fbase.png',
            baseImageMimeType: 'image/png',
          },
        },
        standalone: {
          thumbnail: {
            description: 'Thumbnail de vídeo AVULSO',
            expectedOutput: 'PNG 1280x720',
            baseImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config%2Fpptnc%2Fstandalone%2Fbase.png',
            baseImageMimeType: 'image/png',
          },
        },
      },
    } as never

    await generateThumbnail({ video, podcast, observation: undefined })

    const [prompt, , , options] = mockCallGenAIImage.mock.calls[0]
    expect(String(prompt)).toContain('vídeo AVULSO')
    expect(String(prompt)).not.toContain('CORTE do podcast')
    expect(options.referenceImages[0].uri).toContain('/standalone/')
  })

  it('happy path: calls Vertex AI with base+reference, uploads to staging and returns proxy URL', async () => {
    const result = await generateThumbnail({
      video: baseVideo,
      podcast: basePodcast,
      observation: 'fundo escuro',
    })

    expect(mockCallGenAIImage).toHaveBeenCalledTimes(1)
    const [prompt, , model, options] = mockCallGenAIImage.mock.calls[0]
    expect(String(prompt)).toContain('Por que Rust é melhor que C')
    expect(String(prompt)).toContain('fundo escuro')
    expect(model).toBeUndefined() // basePodcast has no llmConfig.thumbnailImageModel override

    const refImages = options.referenceImages
    expect(refImages).toHaveLength(2)
    expect(refImages[0]).toMatchObject({
      role: 'base',
      uri: 'gs://iara-images/thumbnail-config/pptnc/episode/base.png',
      mimeType: 'image/png',
    })
    expect(refImages[1]).toMatchObject({
      role: 'reference',
      uri: 'gs://iara-images/thumbnail-config/pptnc/episode/ref.jpg',
      mimeType: 'image/jpeg',
    })

    expect(mockUploadThumbnailStagingImage).toHaveBeenCalledWith(
      'video-1',
      'generated',
      expect.any(Buffer),
      'image/png'
    )
    expect(result.thumbnailUrl).toBe(
      '/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fpptnc%2Fvideo-1%2Fgen-123.png'
    )
  })

  it('includes guest photo as a third reference image when provided', async () => {
    await generateThumbnail({
      video: { ...baseVideo, videoType: 'cut' } as never,
      podcast: {
        ...basePodcast,
        prompts: {
          cut: {
            thumbnail: {
              description: 'cut prompt',
              expectedOutput: 'out',
              baseImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config%2Fpptnc%2Fcut%2Fbase.png',
              referenceImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config%2Fpptnc%2Fcut%2Fref.png',
            },
          },
        },
      } as never,
      observation: undefined,
      guestPhotoUrl: '/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fpptnc%2Fcut-1%2Fguest-1.png',
    })

    const refImages = mockCallGenAIImage.mock.calls[0][3].referenceImages
    expect(refImages).toHaveLength(3)
    expect(refImages[2]).toMatchObject({
      role: 'guest',
      uri: 'gs://iara-images/thumbnail-staging/pptnc/cut-1/guest-1.png',
    })
  })

  it('retries with backoff on RATE_LIMIT (verified by attempt count, not actual wait)', async () => {
    vi.useFakeTimers()
    try {
      mockCallGenAIImage
        .mockRejectedValueOnce(new LLMError('RATE_LIMIT', 'quota', true))
        .mockRejectedValueOnce(new LLMError('RATE_LIMIT', 'quota', true))
        .mockResolvedValueOnce({ imageBuffer: Buffer.from('x'), mimeType: 'image/png' })

      const promise = generateThumbnail({
        video: baseVideo,
        podcast: basePodcast,
        observation: undefined,
      })

      // Avança 30s (backoff #1) + 60s (backoff #2) — após isso a 3ª tentativa resolve.
      await vi.advanceTimersByTimeAsync(30_000)
      await vi.advanceTimersByTimeAsync(60_000)
      const result = await promise

      expect(mockCallGenAIImage).toHaveBeenCalledTimes(3)
      expect(result.thumbnailUrl).toContain('thumbnail-staging')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not retry on non-RATE_LIMIT LLM errors', async () => {
    mockCallGenAIImage.mockRejectedValueOnce(
      new LLMError('INVALID_RESPONSE', 'sem imagem', false)
    )
    await expect(
      generateThumbnail({ video: baseVideo, podcast: basePodcast, observation: undefined })
    ).rejects.toThrow(/sem imagem/)
    expect(mockCallGenAIImage).toHaveBeenCalledTimes(1)
  })

  it('uses the configured thumbnailImageModel from llmConfig when provided', async () => {
    await generateThumbnail({
      video: baseVideo,
      podcast: {
        ...basePodcast,
        llmConfig: { thumbnailImageModel: 'gemini-3.1-flash-image-preview' },
      } as never,
      observation: undefined,
    })
    expect(mockCallGenAIImage.mock.calls[0][2]).toBe('gemini-3.1-flash-image-preview')
  })
})
