/**
 * PUT /api/videos/[videoId]/standalone
 *
 * Liga/desliga a flag editorial `standalone` (Epic 25 Bloco B). Avulso = vídeo
 * que não se relaciona com nenhum outro: não tem pai, não tem filhos, sai das
 * listas de pais. Regras do Adendo B (2026-10-02):
 *
 * - Marcar (standalone=true): vale para QUALQUER tipo, inclusive episódio, mas
 *   só para vídeo SEM vínculo. Com vínculo → 409 VIDEO_LINKED com os vínculos
 *   em `details` (a UI mostra o que impede). Não existe "desvincular": corte/
 *   reel com pai nunca vira avulso (acabou o "marcar avulso apaga o pai").
 *   Revalidado dentro da transação da escrita.
 * - Desmarcar (standalone=false): o produtor ESCOLHE o tipo (`videoType`
 *   obrigatório — a régua da duração não decide) e o wizard recomeça: dados
 *   gerados espurgados, imagens incluídas, título/descrição/tags restaurados do
 *   YouTube (lib/wizard/purge-wizard-data.ts). Corte/reel volta a pedir pai.
 *
 * Body: { standalone: true } | { standalone: false, videoType: 'episode' | 'cut' | 'reel' }
 */

import { FieldValue } from 'firebase-admin/firestore'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { runAvulsoPurge } from '@/lib/api/avulso-purge'
import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getAdminDb } from '@/lib/firebase/admin'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import { VideoTypeSchema } from '@/lib/schemas/video'
import { assertUnlinkedInTx, getVideoRelations, hasRelations, VideoLinkedError } from '@/lib/wizard/video-relations'

export const runtime = 'nodejs'

const RequestBodySchema = z.discriminatedUnion('standalone', [
  z.object({ standalone: z.literal(true) }),
  z.object({ standalone: z.literal(false), videoType: VideoTypeSchema }),
])

interface RouteContext {
  params: Promise<{ videoId: string }>
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessao expirada' } },
      { status: 401 }
    )
  }

  const { videoId } = await context.params

  // Parse and validate request body
  let body: z.infer<typeof RequestBodySchema>
  try {
    const rawBody = await request.json()
    body = RequestBodySchema.parse(rawBody)
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_BODY',
          message: 'Body invalido: standalone (boolean) obrigatorio; ao desmarcar, videoType (episode|cut|reel) tambem',
        },
      },
      { status: 400 }
    )
  }

  const { standalone } = body

  try {
    // 1. Get the current video
    const video = await getVideoAdmin(PODCAST_ID, videoId)

    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Video nao encontrado' } },
        { status: 404 }
      )
    }

    // 2. Desmarcar: o produtor escolhe o tipo + espurgo do wizard (Adendo B).
    if (!body.standalone) {
      if (!video.standalone) {
        return NextResponse.json({
          data: { standalone: false, videoType: video.videoType, imagesPurged: true },
        })
      }
      const { videoType } = body
      const result = await runAvulsoPurge({
        podcastId: PODCAST_ID,
        userId: session.user.id,
        video,
        patch: { standalone: false, videoType },
      })
      if (!result.ok) return result.response

      log('INFO', 'Standalone flag disabled (wizard purged, type chosen by producer)', {
        userId: session.user.id,
        videoId,
        from: video.videoType,
        to: videoType,
        imagesPurged: result.imagesPurged,
      })
      return NextResponse.json({
        data: { standalone: false, videoType, imagesPurged: result.imagesPurged },
      })
    }

    // 3. Marcar: qualquer tipo, só sem vínculo (Adendo B).
    const relations = await getVideoRelations(PODCAST_ID, video)
    if (hasRelations(relations)) {
      return NextResponse.json(
        {
          error: {
            code: 'VIDEO_LINKED',
            message: 'Vídeos vinculados a outro vídeo (pai ou filhos) não podem ser avulsos',
            details: relations,
          },
        },
        { status: 409 }
      )
    }

    const videoRef = getAdminDb()
      .collection('podcasts')
      .doc(PODCAST_ID)
      .collection('videos')
      .doc(videoId)
    try {
      await getAdminDb().runTransaction(async (tx) => {
        await assertUnlinkedInTx(tx, PODCAST_ID, videoId)
        const current = await tx.get(videoRef)
        // Mesmo auto-draft do updateVideoAdmin: mexer num vídeo 'new' o torna 'draft'.
        tx.update(videoRef, {
          standalone: true,
          ...(current.get('status') === 'new' ? { status: 'draft' } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        })
      })
    } catch (error) {
      if (error instanceof VideoLinkedError) {
        return NextResponse.json(
          { error: { code: error.code, message: error.message } },
          { status: 409 }
        )
      }
      throw error
    }

    log('INFO', 'Standalone flag enabled', {
      userId: session.user.id,
      videoId,
      videoType: video.videoType,
    })

    return NextResponse.json({ data: { standalone: true } })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to toggle standalone flag', {
      userId: session.user.id,
      videoId,
      standalone,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao alterar flag de video avulso' } },
      { status: 500 }
    )
  }
}
