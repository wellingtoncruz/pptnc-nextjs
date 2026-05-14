/**
 * Geração assíncrona de thumbnail — Epic 22 / Story 22.4.
 *
 * Substitui o stub da 22.3c. Fluxo:
 * 1. Frontend POST `/api/wizard/thumbnail/generate` com `{ videoId, observation?, guestPhotoUrl? }`.
 * 2. Endpoint valida sessão + vídeo, cria um wizard job (`phase='thumbnail'`,
 *    `status='pending'`) e dispara o worker em background (fire-and-forget).
 *    Retorna 202 com `{ jobId, podcastId, status: 'pending' }`.
 * 3. Worker chama `generateThumbnail()` (lib/wizard/thumbnail-generator) que
 *    monta prompt + reference images (Base, Referência, foto do convidado),
 *    chama Vertex AI com retry/backoff 30s/60s/120s para RATE_LIMIT, sobe o
 *    PNG resultante pro staging e devolve `{ thumbnailUrl, filePath }`.
 * 4. Worker grava o resultado no job (`status='complete'`, `result`). Em
 *    erro: `status='failed'` + `error` PT-BR.
 * 5. Frontend faz polling em `GET /api/wizard/jobs/{jobId}?videoId=...` no
 *    mesmo ritmo das demais fases async.
 *
 * Nada aqui depende de `runAsyncPhase` direto — usamos a infra de wizard
 * jobs existente (criada pra outras fases) por já oferecer signal channel
 * idêntico ao que precisamos.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { createWizardJob, updateWizardJob } from '@/lib/firebase/wizard-jobs-admin'
import { LLMError, createLLMError } from '@/lib/llm'
import { log } from '@/lib/logger'
import { generateThumbnail } from '@/lib/wizard/thumbnail-generator'
import type { Podcast } from '@/types/podcast'
import type { Video } from '@/types/video'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  videoId: z.string().min(1, 'videoId é obrigatório'),
  observation: z.string().max(2000).optional(),
  /**
   * URL (proxy autenticado) da foto do convidado já cropada (Story 22.3f).
   * Quando presente, vira reference image extra na chamada Vertex (role=guest).
   */
  guestPhotoUrl: z.string().url().or(z.string().startsWith('/api/')).optional(),
})

/**
 * Worker em background — nunca lança. Toda falha é persistida no job pra
 * polling do cliente. Não usar `await` no caller; deve ser fire-and-forget.
 */
async function processThumbnailJob(params: {
  jobId: string
  video: Video
  podcast: Podcast
  observation: string | undefined
  guestPhotoUrl: string | undefined
}): Promise<void> {
  const { jobId, video, podcast, observation, guestPhotoUrl } = params
  try {
    await updateWizardJob(PODCAST_ID, video.id, jobId, { status: 'processing' })
    const result = await generateThumbnail({ video, podcast, observation, guestPhotoUrl })
    // Firestore rejeita `undefined` em qualquer field — só inclui observation
    // no result quando o produtor de fato digitou algo.
    const trimmedObservation = observation?.trim()
    const jobResult: { thumbnailUrl: string; observation?: string } = {
      thumbnailUrl: result.thumbnailUrl,
    }
    if (trimmedObservation) {
      jobResult.observation = trimmedObservation
    }
    await updateWizardJob(PODCAST_ID, video.id, jobId, {
      status: 'complete',
      result: jobResult,
    })
    log('INFO', 'Async thumbnail job completed', { jobId, videoId: video.id })
  } catch (error) {
    const llmError = error instanceof LLMError ? error : createLLMError(error)
    log('WARN', 'Async thumbnail job failed', {
      jobId,
      videoId: video.id,
      errorCode: llmError.code,
      errorMessage: llmError.message,
    })
    try {
      await updateWizardJob(PODCAST_ID, video.id, jobId, {
        status: 'failed',
        error: {
          code: llmError.code,
          message: llmError.message,
          retryable: llmError.retryable,
        },
      })
    } catch (updateError) {
      log('ERROR', 'Failed to record thumbnail job failure', {
        jobId,
        videoId: video.id,
        updateError: updateError instanceof Error ? updateError.message : String(updateError),
      })
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Corpo da requisição inválido' } },
      { status: 400 }
    )
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Dados de requisição inválidos' } },
      { status: 400 }
    )
  }
  const { videoId, observation, guestPhotoUrl } = parsed.data

  const video = await getVideoAdmin(PODCAST_ID, videoId)
  if (!video) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
      { status: 404 }
    )
  }

  if (video.videoType !== 'episode' && video.videoType !== 'cut') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_VIDEO_TYPE',
          message: 'Geração de thumbnail está disponível apenas para episódios e cortes',
        },
      },
      { status: 400 }
    )
  }

  const podcast = await getPodcastAdmin(PODCAST_ID)
  if (!podcast) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Podcast não encontrado' } },
      { status: 404 }
    )
  }

  log('INFO', 'Async thumbnail job starting', {
    videoId,
    videoType: video.videoType,
    hasObservation: Boolean(observation),
    hasGuestPhoto: Boolean(guestPhotoUrl),
  })

  const jobId = await createWizardJob(PODCAST_ID, {
    videoId,
    phase: 'thumbnail',
    ...(observation ? { additionalContext: observation } : {}),
  })

  // Fire-and-forget — worker grava status/result no job pro polling.
  void processThumbnailJob({
    jobId,
    video,
    podcast,
    observation,
    guestPhotoUrl,
  })

  return NextResponse.json(
    { jobId, podcastId: PODCAST_ID, status: 'pending' },
    { status: 202 }
  )
}
