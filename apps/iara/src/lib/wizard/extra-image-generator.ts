/**
 * Geração das imagens extras do episódio — Epic 28 / Story 28.4.
 *
 * Story, Vitrine e Feed seguem exatamente o pipeline do thumbnail
 * (`thumbnail-generator.ts`), do qual reaproveita `buildThumbnailPrompt` e o
 * loop de retry: prompt interpolado + Base/Referência como reference images →
 * `callGenAIImage` → staging. O que muda é de onde a config vem
 * (`podcast.prompts.episode.extraImages[kind]`) e o gate de tipo de vídeo:
 * imagens extras existem só para episódios.
 *
 * Não há foto de convidado aqui — aquilo é específico do thumbnail de cortes.
 *
 * A proporção NÃO é parametrizada: fica a cargo do prompt e das imagens de
 * referência (decisão Wellington, 2026-07-28). Para isso valer de fato, a
 * chamada usa `omitAspectRatio` — o default 16:9 de `callGenAIImage` vence o
 * prompt e fazia Story/Feed saírem widescreen (homologação, 2026-07-28).
 *
 * CRITICAL: Never expose to the client.
 */

import { uploadThumbnailStagingImage } from '@/lib/firebase/cloud-storage'
import { NEWSLETTER_IMAGES_BUCKET, PODCAST_ID } from '@/lib/firebase/config'
import { callGenAIImage, type ReferenceImage } from '@/lib/llm/image-client'
import { LLMError } from '@/lib/llm/errors'
import { log } from '@/lib/logger'
import type { ExtraImageKind } from '@/lib/schemas/podcast'
import { EXTRA_IMAGE_LABELS } from '@/lib/schemas/podcast'
import type { Podcast, ThumbnailPromptField } from '@/types/podcast'
import type { Video } from '@/types/video'

import { buildThumbnailPrompt } from './thumbnail-generator'

/** Backoff em segundos entre tentativas após RATE_LIMIT. Igual ao thumbnail. */
const RATE_LIMIT_BACKOFFS_SEC = [30, 60, 120]

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export interface GenerateExtraImageParams {
  video: Video
  podcast: Podcast
  kind: ExtraImageKind
  observation?: string
}

export interface GenerateExtraImageResult {
  imageUrl: string
  filePath: string
}

function extractGcsPath(proxyUrl: string): string | null {
  if (!proxyUrl) return null
  const match = proxyUrl.match(/[?&]path=([^&]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function pathToReferenceImage(
  proxyUrl: string | undefined,
  role: 'base' | 'reference',
  fallbackMimeType?: string
): ReferenceImage | null {
  if (!proxyUrl) return null
  const path = extractGcsPath(proxyUrl)
  if (!path) return null
  const bucket = NEWSLETTER_IMAGES_BUCKET
  if (!bucket) {
    log('WARN', 'NEWSLETTER_IMAGES_BUCKET unset — reference image will be skipped', { role, path })
    return null
  }
  const ext = path.split('.').pop()?.toLowerCase() ?? 'png'
  return {
    role,
    uri: `gs://${bucket}/${path}`,
    mimeType: fallbackMimeType ?? EXT_TO_MIME[ext] ?? 'image/png',
  }
}

/**
 * Resolve a config da imagem extra pedida.
 *
 * Diferente do thumbnail, NÃO há fallback para outro bucket: se a config de
 * Story não estiver preenchida, gerar a partir da config do Feed (ou da
 * thumbnail) produziria silenciosamente a imagem errada. É melhor falhar com
 * uma mensagem que diz exatamente onde configurar.
 */
export function getExtraImageConfig(
  podcast: Podcast,
  videoType: Video['videoType'],
  kind: ExtraImageKind
): ThumbnailPromptField {
  if (videoType !== 'episode') {
    throw new LLMError(
      'INVALID_RESPONSE',
      'Imagens extras estão disponíveis apenas para episódios',
      false
    )
  }
  const config = podcast.prompts?.episode?.extraImages?.[kind]
  if (!config?.description || !config?.expectedOutput) {
    throw new LLMError(
      'INVALID_RESPONSE',
      `Configuração da imagem ${EXTRA_IMAGE_LABELS[kind]} incompleta. Preencha Descrição e Saída Esperada em Configurações → Prompts por Tipo de Vídeo → Episódios → Imagens Extras.`,
      false
    )
  }
  return config
}

function buildReferenceImages(config: ThumbnailPromptField): ReferenceImage[] {
  const refs: ReferenceImage[] = []
  const base = pathToReferenceImage(config.baseImageUrl, 'base', config.baseImageMimeType ?? undefined)
  const ref = pathToReferenceImage(
    config.referenceImageUrl,
    'reference',
    config.referenceImageMimeType ?? undefined
  )
  if (base) refs.push(base)
  if (ref) refs.push(ref)
  return refs
}

/**
 * Gera uma imagem extra com retry escalonado contra RATE_LIMIT.
 *
 * Toda outra falha (configuração ruim, INVALID_RESPONSE etc.) propaga na
 * primeira tentativa — só faz sentido esperar quando o motivo é quota.
 */
export async function generateExtraImage(
  params: GenerateExtraImageParams
): Promise<GenerateExtraImageResult> {
  const { video, podcast, kind, observation } = params
  const config = getExtraImageConfig(podcast, video.videoType, kind)
  const prompt = buildThumbnailPrompt(config, video, observation)
  const referenceImages = buildReferenceImages(config)
  const modelOverride = podcast.llmConfig?.thumbnailImageModel

  const debugContext = podcast.features?.llmDebugMode
    ? {
        component: `wizard/phase-extra-images/${kind}`,
        videoId: video.id,
        videoType: video.videoType ?? 'episode',
        podcastId: PODCAST_ID,
      }
    : undefined

  let lastError: LLMError | Error | null = null
  const maxAttempts = RATE_LIMIT_BACKOFFS_SEC.length + 1
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { imageBuffer, mimeType } = await callGenAIImage(prompt, debugContext, modelOverride, {
        referenceImages,
        // Sem isso a API força 16:9 e ignora o que a Saída Esperada pedir —
        // Story sairia widescreen. A proporção é decidida pelo prompt e pelas
        // imagens de referência.
        omitAspectRatio: true,
      })

      // Staging é compartilhado com o thumbnail: o proxy GET de
      // /api/wizard/thumbnail/upload já serve `thumbnail-staging/`, então
      // reusar evita uma rota e uma validação de path duplicadas. A separação
      // por `kind` só importa no path final, na seleção.
      const { filePath } = await uploadThumbnailStagingImage(
        video.id,
        'generated',
        imageBuffer,
        mimeType
      )
      const imageUrl = `/api/wizard/thumbnail/upload?path=${encodeURIComponent(filePath)}`

      log('INFO', 'Extra image generation succeeded', {
        videoId: video.id,
        kind,
        attempts: attempt + 1,
        filePath,
        referenceImagesCount: referenceImages.length,
      })
      return { imageUrl, filePath }
    } catch (err) {
      lastError = err as Error
      const isRateLimit = err instanceof LLMError && err.code === 'RATE_LIMIT'
      const backoff = RATE_LIMIT_BACKOFFS_SEC[attempt]
      if (!isRateLimit || backoff === undefined) {
        throw err
      }
      log('WARN', 'Extra image generation hit RATE_LIMIT — backing off', {
        videoId: video.id,
        kind,
        attempt: attempt + 1,
        nextDelaySec: backoff,
      })
      await new Promise((resolve) => setTimeout(resolve, backoff * 1000))
    }
  }

  throw (
    lastError ??
    new LLMError('RATE_LIMIT', 'Limite do Vertex AI atingido. Tente novamente em alguns minutos.', true)
  )
}
