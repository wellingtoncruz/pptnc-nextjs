/**
 * Geração real de thumbnail via Vertex AI — Epic 22 / Story 22.4.
 *
 * Pipeline:
 * 1. Compõe o prompt: `prompts.{type}.thumbnail.description` + `expectedOutput`
 *    + observação opcional do produtor, com `{{video.field}}` interpolado.
 * 2. Monta o array de `referenceImages` a partir das URLs do Cloud Storage
 *    configuradas (Base + Referência) + foto do convidado opcional (cuts).
 * 3. Chama `callGenAIImage(prompt, debugContext, modelOverride, { referenceImages })`
 *    com retry/backoff escalonado 30s/60s/120s pra RATE_LIMIT.
 * 4. Sobe o PNG resultante pro staging via `uploadThumbnailStagingImage`.
 * 5. Devolve o proxy URL pra o caller persistir no job.
 *
 * O retry/backoff aqui é **adicional** ao do `callGenAI` (que já tenta 2x
 * antes de devolver RATE_LIMIT). Esse loop externo dá tempo da quota do
 * Vertex AI recuperar — as janelas preview são apertadas (~10 req/min na
 * última checagem). Após 3 tentativas (~210s total), desiste e propaga o
 * erro pra UI.
 *
 * CRITICAL: Never expose to the client.
 */

import { uploadThumbnailStagingImage } from '@/lib/firebase/cloud-storage'
import { NEWSLETTER_IMAGES_BUCKET, PODCAST_ID } from '@/lib/firebase/config'
import {
  callGenAIImage,
  type ReferenceImage,
  type ReferenceImageRole,
} from '@/lib/llm/image-client'
import { LLMError } from '@/lib/llm/errors'
import { log } from '@/lib/logger'
import { resolveVideoPlaceholders } from '@/lib/youtube/format-chapters'
import type { Podcast, ThumbnailPromptField } from '@/types/podcast'
import type { Video } from '@/types/video'

/** Backoff em segundos entre tentativas após RATE_LIMIT. */
const RATE_LIMIT_BACKOFFS_SEC = [30, 60, 120]

/** MIME → extensão pra montar o `gs://` URI com a extensão certa. */
const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export interface GenerateThumbnailParams {
  video: Video
  podcast: Podcast
  observation?: string
  guestPhotoUrl?: string
}

export interface GenerateThumbnailResult {
  thumbnailUrl: string
  filePath: string
}

/**
 * Extrai o path GCS de uma URL de proxy autenticado. Suporta os três
 * formatos usados pelo Epic 22:
 * - `/api/settings/thumbnail-config?path=thumbnail-config/...`
 * - `/api/wizard/thumbnail/upload?path=thumbnail-staging/...`
 * - `/api/wizard/thumbnail/select?path=thumbnails/...`
 */
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
  role: ReferenceImageRole,
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
  const mimeType = fallbackMimeType ?? EXT_TO_MIME[ext] ?? 'image/png'
  return {
    role,
    uri: `gs://${bucket}/${path}`,
    mimeType,
  }
}

/**
 * Monta o prompt final entregue ao LLM. Estrutura:
 * - description (interpolada com {{video.field}})
 * - expectedOutput
 * - Instrução priorizada do produtor (observation), se houver
 */
export function buildThumbnailPrompt(
  config: ThumbnailPromptField,
  video: Video,
  observation: string | undefined
): string {
  const videoForPlaceholders = video as unknown as Record<string, unknown>
  const description = resolveVideoPlaceholders(config.description ?? '', videoForPlaceholders).trim()
  const expectedOutput = (config.expectedOutput ?? '').trim()

  const parts: string[] = []
  if (description) parts.push(description)
  if (expectedOutput) parts.push(`Saída esperada:\n${expectedOutput}`)

  const trimmedObservation = observation?.trim()
  if (trimmedObservation) {
    parts.push(
      `INSTRUÇÃO PRIORITÁRIA DO PRODUTOR (atender com prioridade sobre as demais):\n${trimmedObservation}`
    )
  }

  return parts.join('\n\n')
}

function getThumbnailConfig(podcast: Podcast, videoType: Video['videoType']): ThumbnailPromptField {
  if (videoType !== 'episode' && videoType !== 'cut') {
    throw new LLMError(
      'INVALID_RESPONSE',
      'Geração de thumbnail está disponível apenas para episódios e cortes',
      false
    )
  }
  const config = podcast.prompts?.[videoType]?.thumbnail
  if (!config?.description || !config?.expectedOutput) {
    throw new LLMError(
      'INVALID_RESPONSE',
      'Configuração de thumbnail incompleta. Preencha Descrição e Saída Esperada em Settings.',
      false
    )
  }
  return config
}

/**
 * Lê as 2-3 reference images apropriadas: Base + Referência da config
 * obrigatórias; foto do convidado opcional (apenas cuts e quando enviada
 * pelo produtor).
 */
function buildReferenceImages(
  config: ThumbnailPromptField,
  guestPhotoUrl?: string
): ReferenceImage[] {
  const refs: ReferenceImage[] = []
  const base = pathToReferenceImage(config.baseImageUrl, 'base', config.baseImageMimeType ?? undefined)
  const ref = pathToReferenceImage(config.referenceImageUrl, 'reference', config.referenceImageMimeType ?? undefined)
  const guest = pathToReferenceImage(guestPhotoUrl, 'guest')
  if (base) refs.push(base)
  if (ref) refs.push(ref)
  if (guest) refs.push(guest)
  return refs
}

/**
 * Executa a geração com retry escalonado contra RATE_LIMIT.
 *
 * Toda outra falha (configuração ruim, INVALID_RESPONSE etc.) propaga na
 * primeira tentativa — só faz sentido esperar quando o motivo é quota.
 */
export async function generateThumbnail(
  params: GenerateThumbnailParams
): Promise<GenerateThumbnailResult> {
  const { video, podcast, observation, guestPhotoUrl } = params
  const config = getThumbnailConfig(podcast, video.videoType)
  const prompt = buildThumbnailPrompt(config, video, observation)
  const referenceImages = buildReferenceImages(config, guestPhotoUrl)
  const modelOverride = podcast.llmConfig?.thumbnailImageModel

  const debugContext = podcast.features?.llmDebugMode
    ? {
        component: 'wizard/phase-thumbnail',
        videoId: video.id,
        videoType: video.videoType ?? 'episode',
        podcastId: PODCAST_ID,
      }
    : undefined

  let lastError: LLMError | Error | null = null
  const maxAttempts = RATE_LIMIT_BACKOFFS_SEC.length + 1
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { imageBuffer, mimeType } = await callGenAIImage(
        prompt,
        debugContext,
        modelOverride,
        { referenceImages }
      )

      const { filePath } = await uploadThumbnailStagingImage(
        video.id,
        'generated',
        imageBuffer,
        mimeType
      )
      const thumbnailUrl = `/api/wizard/thumbnail/upload?path=${encodeURIComponent(filePath)}`

      log('INFO', 'Thumbnail generation succeeded', {
        videoId: video.id,
        attempts: attempt + 1,
        filePath,
        referenceImagesCount: referenceImages.length,
      })
      return { thumbnailUrl, filePath }
    } catch (err) {
      lastError = err as Error
      const isRateLimit = err instanceof LLMError && err.code === 'RATE_LIMIT'
      const backoff = RATE_LIMIT_BACKOFFS_SEC[attempt]
      if (!isRateLimit || backoff === undefined) {
        throw err
      }
      log('WARN', 'Thumbnail generation hit RATE_LIMIT — backing off', {
        videoId: video.id,
        attempt: attempt + 1,
        nextDelaySec: backoff,
      })
      await new Promise((resolve) => setTimeout(resolve, backoff * 1000))
    }
  }

  throw (
    lastError ??
    new LLMError(
      'RATE_LIMIT',
      'Limite do Vertex AI atingido. Tente novamente em alguns minutos.',
      true
    )
  )
}
