/**
 * Tests do gerador das imagens extras — Epic 28 / Story 28.4.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCallGenAIImage = vi.fn()
const mockUploadStaging = vi.fn()

vi.mock('@/lib/llm/image-client', () => ({
  callGenAIImage: (...args: unknown[]) => mockCallGenAIImage(...args),
}))

vi.mock('@/lib/firebase/cloud-storage', () => ({
  uploadThumbnailStagingImage: (...args: unknown[]) => mockUploadStaging(...args),
}))

vi.mock('@/lib/firebase/config', () => ({
  PODCAST_ID: 'pptnc',
  NEWSLETTER_IMAGES_BUCKET: 'test-bucket',
}))

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { LLMError } from '@/lib/llm/errors'
import type { Podcast } from '@/types/podcast'
import type { Video } from '@/types/video'

import { generateExtraImage, getExtraImageConfig } from './extra-image-generator'

const filledConfig = {
  description: 'Gere a imagem de {{video.title}}',
  expectedOutput: 'Imagem vertical, sem texto',
  baseImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config/pptnc/episode/story/base-1.png',
  baseImageMimeType: 'image/png',
  referenceImageUrl:
    '/api/settings/thumbnail-config?path=thumbnail-config/pptnc/episode/story/reference-1.jpg',
  referenceImageMimeType: 'image/jpeg',
}

function makePodcast(overrides?: Record<string, unknown>): Podcast {
  return {
    prompts: {
      episode: {
        extraImages: { story: filledConfig, vitrine: filledConfig, feed: filledConfig },
      },
    },
    ...overrides,
  } as unknown as Podcast
}

const episode = { id: 'vid1', videoType: 'episode', title: 'Ep 42' } as unknown as Video

describe('getExtraImageConfig', () => {
  it('devolve a config do kind pedido', () => {
    expect(getExtraImageConfig(makePodcast(), 'episode', 'story')).toEqual(filledConfig)
  })

  it('rejeita videoType que não é episode', () => {
    expect(() => getExtraImageConfig(makePodcast(), 'cut', 'story')).toThrow(
      /apenas para episódios/
    )
  })

  /**
   * Sem fallback de propósito: gerar Story a partir da config de Feed (ou da
   * thumbnail) produziria silenciosamente a imagem errada. Falhar com a
   * mensagem que diz onde configurar é melhor que um resultado plausível.
   */
  it('falha quando o prompt do kind está vazio, sem cair em outro kind', () => {
    const podcast = makePodcast()
    ;(podcast.prompts.episode as Record<string, unknown>).extraImages = {
      story: { description: '', expectedOutput: '' },
      feed: filledConfig,
    }
    expect(() => getExtraImageConfig(podcast, 'episode', 'story')).toThrow(/Story/)
  })

  it('falha quando extraImages nem existe', () => {
    const podcast = makePodcast()
    delete (podcast.prompts.episode as Record<string, unknown>).extraImages
    expect(() => getExtraImageConfig(podcast, 'episode', 'feed')).toThrow(/Feed/)
  })
})

describe('generateExtraImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCallGenAIImage.mockResolvedValue({
      imageBuffer: Buffer.from('png'),
      mimeType: 'image/png',
    })
    mockUploadStaging.mockResolvedValue({
      filePath: 'thumbnail-staging/pptnc/vid1/gen-123.png',
      mimeType: 'image/png',
    })
  })

  it('devolve o proxy URL do staging', async () => {
    const result = await generateExtraImage({
      video: episode,
      podcast: makePodcast(),
      kind: 'story',
    })
    expect(result.filePath).toBe('thumbnail-staging/pptnc/vid1/gen-123.png')
    expect(result.imageUrl).toBe(
      '/api/wizard/thumbnail/upload?path=' +
        encodeURIComponent('thumbnail-staging/pptnc/vid1/gen-123.png')
    )
  })

  it('manda Base e Referência como reference images gs://', async () => {
    await generateExtraImage({ video: episode, podcast: makePodcast(), kind: 'vitrine' })

    const [, , , options] = mockCallGenAIImage.mock.calls[0]
    expect(options.referenceImages).toEqual([
      {
        role: 'base',
        uri: 'gs://test-bucket/thumbnail-config/pptnc/episode/story/base-1.png',
        mimeType: 'image/png',
      },
      {
        role: 'reference',
        uri: 'gs://test-bucket/thumbnail-config/pptnc/episode/story/reference-1.jpg',
        mimeType: 'image/jpeg',
      },
    ])
  })

  it('interpola {{video.title}} no prompt', async () => {
    await generateExtraImage({ video: episode, podcast: makePodcast(), kind: 'feed' })
    const [prompt] = mockCallGenAIImage.mock.calls[0]
    expect(prompt).toContain('Ep 42')
    expect(prompt).not.toContain('{{video.title}}')
  })

  it('anexa a observação do produtor como instrução prioritária', async () => {
    await generateExtraImage({
      video: episode,
      podcast: makePodcast(),
      kind: 'story',
      observation: 'fundo escuro',
    })
    const [prompt] = mockCallGenAIImage.mock.calls[0]
    expect(prompt).toContain('INSTRUÇÃO PRIORITÁRIA DO PRODUTOR')
    expect(prompt).toContain('fundo escuro')
  })

  /**
   * O default 16:9 de `callGenAIImage` VENCE o prompt: por mais que a Saída
   * Esperada peça vertical, a API devolvia widescreen (achado na homologação
   * de 2026-07-28). As extras precisam pedir a omissão explicitamente.
   */
  it('pede omitAspectRatio para que a proporção venha do prompt', async () => {
    await generateExtraImage({ video: episode, podcast: makePodcast(), kind: 'story' })
    const [, , , options] = mockCallGenAIImage.mock.calls[0]
    expect(options.omitAspectRatio).toBe(true)
  })

  it('pede a omissão para os três kinds', async () => {
    for (const kind of ['story', 'vitrine', 'feed'] as const) {
      mockCallGenAIImage.mockClear()
      await generateExtraImage({ video: episode, podcast: makePodcast(), kind })
      expect(mockCallGenAIImage.mock.calls[0][3].omitAspectRatio).toBe(true)
    }
  })

  it('usa o thumbnailImageModel configurado como override', async () => {
    const podcast = makePodcast({ llmConfig: { thumbnailImageModel: 'gemini-3-pro-image' } })
    await generateExtraImage({ video: episode, podcast, kind: 'story' })
    expect(mockCallGenAIImage.mock.calls[0][2]).toBe('gemini-3-pro-image')
  })

  it('propaga erro de config sem chamar o modelo', async () => {
    const podcast = makePodcast()
    delete (podcast.prompts.episode as Record<string, unknown>).extraImages
    await expect(
      generateExtraImage({ video: episode, podcast, kind: 'story' })
    ).rejects.toBeInstanceOf(LLMError)
    expect(mockCallGenAIImage).not.toHaveBeenCalled()
  })

  it('propaga erro não-RATE_LIMIT na primeira tentativa (sem retry)', async () => {
    mockCallGenAIImage.mockRejectedValue(new LLMError('INVALID_RESPONSE', 'boom', false))
    await expect(
      generateExtraImage({ video: episode, podcast: makePodcast(), kind: 'story' })
    ).rejects.toThrow('boom')
    expect(mockCallGenAIImage).toHaveBeenCalledTimes(1)
  })
})
