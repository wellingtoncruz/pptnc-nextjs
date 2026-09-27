/**
 * PUT /api/videos/[videoId]/video-type
 *
 * Reclassificação MANUAL do tipo de um vídeo avulso — adendo do Epic 25
 * (2026-09-27). Por padrão o tipo vem da duração e é rígido; marcar o vídeo
 * como avulso destrava a escolha, e ela é livre (episódio, corte ou reel).
 * Avulso reclassificado como episódio roda o wizard completo, com os prompts
 * de episódio.
 *
 * Trocar o tipo reinicia o wizard: os dados gerados pelo wizard anterior são
 * espurgados (imagens incluídas) e título/descrição/tags voltam ao que está no
 * YouTube — ver `lib/wizard/purge-wizard-data.ts`. A UI pede confirmação antes.
 *
 * Avulso nunca tem pai (nem filhos): o vínculo é zerado na mesma escrita.
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
  if (!video.standalone) {
    return NextResponse.json(
      { error: { code: 'NOT_STANDALONE', message: 'Só vídeos avulsos podem ser reclassificados' } },
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
    patch: { videoType, parentEpisodeId: '' },
  })
  if (!result.ok) return result.response

  log('INFO', 'Avulso reclassified (wizard purged)', {
    userId: session.user.id,
    videoId,
    from: video.videoType,
    to: videoType,
    imagesPurged: result.imagesPurged,
  })
  return NextResponse.json({ data: { videoType, imagesPurged: result.imagesPurged } })
}
