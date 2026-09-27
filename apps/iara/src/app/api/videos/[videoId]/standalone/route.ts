/**
 * PUT /api/videos/[videoId]/standalone
 *
 * Toggles the editorial `standalone` flag on a cut or reel video (Epic 25
 * Bloco B). A standalone video is a PPTNC video that is NOT podcast content
 * (an AI-generated news video, a message to listeners) and has no parent
 * episode.
 *
 * - Enabling (standalone=true): also clears the parent link and the fields
 *   inherited from the parent (parentEpisodeId, guests, theme). These are
 *   re-inherited if the producer later turns the flag off and re-selects a
 *   parent via PUT /parent.
 * - Disabling (standalone=false) — adendo do Epic 25 (2026-09-27): o tipo
 *   volta a ser o da DURAÇÃO (a reclassificação manual só vale para avulso) e
 *   o wizard recomeça — dados gerados espurgados, imagens incluídas, título/
 *   descrição/tags restaurados do YouTube (lib/wizard/purge-wizard-data.ts).
 *   A seleção de pai reaparece se o tipo voltar a corte/reel.
 *
 * Only cut and reel videos can BECOME standalone (by duration, "por enquanto" —
 * decision Wellington; see ADR-25.3). Once standalone, the type is free
 * (PUT /video-type), so disabling must work whatever the current type is.
 *
 * Body: { standalone: boolean }
 *
 * Returns:
 * - Success: { data: { standalone, parentEpisodeId, guests, theme } }
 * - Error: { error: { code: ErrorCode, message: string } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { runAvulsoPurge } from '@/lib/api/avulso-purge'
import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import { classifyVideoType } from '@/lib/video-utils'

export const runtime = 'nodejs'

const RequestBodySchema = z.object({
  standalone: z.boolean(),
})

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
      { error: { code: 'INVALID_BODY', message: 'Body invalido: standalone (boolean) obrigatorio' } },
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

    // 2. Desmarcar: tipo volta ao da duração + espurgo do wizard (adendo 25).
    if (!standalone) {
      if (!video.standalone) {
        return NextResponse.json({
          data: { standalone: false, videoType: video.videoType, imagesPurged: true },
        })
      }
      const podcast = await getPodcastAdmin(PODCAST_ID)
      if (!podcast) {
        return NextResponse.json(
          { error: { code: 'PODCAST_NOT_CONFIGURED', message: 'Podcast não encontrado' } },
          { status: 500 }
        )
      }
      const videoType = classifyVideoType(video.duration, podcast.videoTypes)
      const result = await runAvulsoPurge({
        podcastId: PODCAST_ID,
        userId: session.user.id,
        video,
        patch: { standalone: false, videoType },
      })
      if (!result.ok) return result.response

      log('INFO', 'Standalone flag disabled (wizard purged, type from duration)', {
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

    // 3. Marcar: só corte ou reel (episódios fora do escopo, por enquanto)
    if (video.videoType === 'episode' || !video.videoType) {
      return NextResponse.json(
        { error: { code: 'INVALID_VIDEO_TYPE', message: 'Apenas videos cut ou reel podem ser avulsos' } },
        { status: 400 }
      )
    }

    // 4. Enabling clears the parent link + inherited fields (guests/theme came
    // from the parent via PUT /parent).
    const updateData = { standalone: true, parentEpisodeId: '', guests: [], theme: '' }

    await updateVideoAdmin(PODCAST_ID, videoId, updateData)

    log('INFO', 'Standalone flag toggled', {
      userId: session.user.id,
      videoId,
      videoType: video.videoType,
      standalone: true,
      clearedParent: true,
    })

    return NextResponse.json({
      data: { standalone: true, parentEpisodeId: '', guests: [], theme: '' },
    })
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
