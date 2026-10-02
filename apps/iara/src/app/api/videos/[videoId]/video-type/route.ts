/**
 * PUT /api/videos/[videoId]/video-type
 *
 * Reclassificação MANUAL do tipo de um vídeo — Epic 25, Adendos A (2026-09-27)
 * e B (2026-10-02). O tipo nasce da duração; o produtor pode corrigi-lo em
 * qualquer vídeo SEM vínculo pai/filho (o vínculo prova que o tipo está certo).
 * O avulso proíbe vínculo, então é sempre reclassificável. Reclassificar NÃO
 * torna avulso: corte/reel não avulso segue para a seleção de pai.
 *
 * Trocar o tipo reinicia o wizard: os dados gerados pelo wizard anterior são
 * espurgados (imagens incluídas) e título/descrição/tags voltam ao que está no
 * YouTube — ver `lib/wizard/purge-wizard-data.ts`. A UI pede confirmação antes.
 *
 * Vídeo com vínculo → 409 VIDEO_LINKED (a UI nem mostra a opção). A
 * elegibilidade é revalidada dentro da transação da escrita (corrida com outra
 * aba vinculando um corte).
 *
 * Body: { videoType: 'episode' | 'cut' | 'reel' }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { runAvulsoPurge } from '@/lib/api/avulso-purge'
import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import { VideoTypeSchema } from '@/lib/schemas/video'
import { assertUnlinkedInTx, canReclassify, getVideoRelations } from '@/lib/wizard/video-relations'

export const runtime = 'nodejs'

const RequestBodySchema = z.object({ videoType: VideoTypeSchema })

interface RouteContext {
  params: Promise<{ videoId: string }>
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { videoId } = await context.params

  let videoType: z.infer<typeof VideoTypeSchema>
  try {
    videoType = RequestBodySchema.parse(await request.json()).videoType
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Body inválido: videoType (episode|cut|reel) obrigatório' } },
      { status: 400 }
    )
  }

  const video = await getVideoAdmin(PODCAST_ID, videoId)
  if (!video) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
      { status: 404 }
    )
  }
  const relations = await getVideoRelations(PODCAST_ID, video)
  if (!canReclassify(video, relations)) {
    return NextResponse.json(
      {
        error: {
          code: 'VIDEO_LINKED',
          message: 'Vídeos vinculados a outro vídeo (pai ou filhos) não podem ser reclassificados',
          details: relations,
        },
      },
      { status: 409 }
    )
  }
  if (video.videoType === videoType) {
    return NextResponse.json(
      { error: { code: 'SAME_TYPE', message: 'O vídeo já é deste tipo' } },
      { status: 400 }
    )
  }

  const result = await runAvulsoPurge({
    podcastId: PODCAST_ID,
    userId: session.user.id,
    video,
    patch: { videoType },
    // Avulso não tem vínculo por construção (PUT /parent recusa); os demais
    // são revalidados na escrita.
    guard: video.standalone ? undefined : (tx) => assertUnlinkedInTx(tx, PODCAST_ID, videoId),
  })
  if (!result.ok) return result.response

  log('INFO', 'Video reclassified (wizard purged)', {
    userId: session.user.id,
    videoId,
    from: video.videoType,
    to: videoType,
    standalone: video.standalone === true,
    imagesPurged: result.imagesPurged,
  })
  return NextResponse.json({ data: { videoType, imagesPurged: result.imagesPurged } })
}
