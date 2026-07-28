/**
 * Geração assíncrona das imagens extras do episódio — Epic 28 / Story 28.4.
 *
 * Mesmo desenho da rota de thumbnail (Story 22.4): cria um wizard job, dispara
 * o worker em background e devolve 202 + `jobId`; o frontend faz polling em
 * `GET /api/jobs/{jobId}`.
 *
 * O `result` usa a chave `thumbnailUrl` de propósito — é o que o
 * `GenerateImageCard` (compartilhado com a fase Thumbnail) lê. Renomear aqui
 * exigiria parametrizar o card sem ganho nenhum.
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { createJob } from '@/lib/firebase/jobs-admin'
import { runJobInBackground } from '@/lib/jobs/run-job-in-background'
import { log } from '@/lib/logger'
import { EXTRA_IMAGE_KINDS } from '@/lib/schemas/podcast'
import { generateExtraImage } from '@/lib/wizard/extra-image-generator'
import type { Podcast } from '@/types/podcast'
import type { Video } from '@/types/video'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  videoId: z.string().min(1, 'videoId é obrigatório'),
  kind: z.enum(EXTRA_IMAGE_KINDS),
  observation: z.string().max(2000).optional(),
})

function buildExtraImageWork(params: {
  video: Video
  podcast: Podcast
  kind: (typeof EXTRA_IMAGE_KINDS)[number]
  observation: string | undefined
}): () => Promise<{ result: { thumbnailUrl: string; kind: string; observation?: string } }> {
  const { video, podcast, kind, observation } = params
  return async () => {
    const result = await generateExtraImage({ video, podcast, kind, observation })
    // Firestore rejeita `undefined` em qualquer field — só inclui observation
    // quando o produtor de fato digitou algo.
    const trimmedObservation = observation?.trim()
    const jobResult: { thumbnailUrl: string; kind: string; observation?: string } = {
      thumbnailUrl: result.imageUrl,
      kind,
    }
    if (trimmedObservation) {
      jobResult.observation = trimmedObservation
    }
    return { result: jobResult }
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
  const { videoId, kind, observation } = parsed.data

  const video = await getVideoAdmin(PODCAST_ID, videoId)
  if (!video) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
      { status: 404 }
    )
  }

  if (video.videoType !== 'episode') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_VIDEO_TYPE',
          message: 'Imagens extras estão disponíveis apenas para episódios',
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

  log('INFO', 'Async extra image job starting', {
    videoId,
    kind,
    hasObservation: Boolean(observation),
  })

  const jobId = await createJob(PODCAST_ID, {
    type: 'wizard:extra-image',
    context: { videoId, phase: 'extra-images', kind },
  })

  // Fire-and-forget — runJobInBackground grava status/result/erro no job.
  void runJobInBackground(
    PODCAST_ID,
    jobId,
    buildExtraImageWork({ video, podcast, kind, observation })
  )

  return NextResponse.json({ jobId, podcastId: PODCAST_ID, status: 'pending' }, { status: 202 })
}
