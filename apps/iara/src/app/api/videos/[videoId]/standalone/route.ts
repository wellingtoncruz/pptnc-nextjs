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
 * - Disabling (standalone=false): just flips the flag; the parent-selection
 *   phase reappears in the wizard.
 *
 * Only cut and reel videos can be standalone (episodes are out of scope —
 * decision Wellington; see ADR-25.3).
 *
 * Body: { standalone: boolean }
 *
 * Returns:
 * - Success: { data: { standalone, parentEpisodeId, guests, theme } }
 * - Error: { error: { code: ErrorCode, message: string } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'

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

    // 2. Validate that current video is cut or reel (episodes are out of scope)
    if (video.videoType === 'episode' || !video.videoType) {
      return NextResponse.json(
        { error: { code: 'INVALID_VIDEO_TYPE', message: 'Apenas videos cut ou reel podem ser avulsos' } },
        { status: 400 }
      )
    }

    // 3. Build the update. Enabling clears the parent link + inherited fields
    // (guests/theme came from the parent via PUT /parent); disabling just
    // flips the flag.
    const updateData = standalone
      ? { standalone: true, parentEpisodeId: '', guests: [], theme: '' }
      : { standalone: false }

    await updateVideoAdmin(PODCAST_ID, videoId, updateData)

    log('INFO', 'Standalone flag toggled', {
      userId: session.user.id,
      videoId,
      videoType: video.videoType,
      standalone,
      clearedParent: standalone,
    })

    return NextResponse.json({
      data: {
        standalone,
        parentEpisodeId: standalone ? '' : (video.parentEpisodeId ?? ''),
        guests: standalone ? [] : (video.guests ?? []),
        theme: standalone ? '' : (video.theme ?? ''),
      },
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
