/**
 * PUT /api/videos/[videoId]/parent
 *
 * Sets the parent episode for a cut or reel video.
 * Inherits guests and theme from the parent episode.
 *
 * This is used by Phase 0 (Parent Selection) for cut and reel videos.
 * Only cut and reel videos can have a parent episode.
 *
 * Body: { parentEpisodeId: string }
 *
 * Returns:
 * - Success: { data: { parentEpisodeId, guests, theme } }
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
  parentEpisodeId: z.string().min(1, 'parentEpisodeId is required'),
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
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Body invalido: parentEpisodeId obrigatorio' } },
      { status: 400 }
    )
  }

  const { parentEpisodeId } = body

  try {
    // 1. Get the current video
    const video = await getVideoAdmin(PODCAST_ID, videoId)

    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Video nao encontrado' } },
        { status: 404 }
      )
    }

    // 2. Validate that current video is cut or reel
    if (video.videoType === 'episode' || !video.videoType) {
      return NextResponse.json(
        { error: { code: 'INVALID_VIDEO_TYPE', message: 'Apenas videos cut ou reel podem ter pai' } },
        { status: 400 }
      )
    }

    // 2b. Validate no self-reference
    if (parentEpisodeId === videoId) {
      return NextResponse.json(
        { error: { code: 'SELF_REFERENCE', message: 'Video nao pode ser pai de si mesmo' } },
        { status: 400 }
      )
    }

    // 3. Get the parent episode
    const parentEpisode = await getVideoAdmin(PODCAST_ID, parentEpisodeId)

    if (!parentEpisode) {
      return NextResponse.json(
        { error: { code: 'PARENT_NOT_FOUND', message: 'Episodio pai nao encontrado' } },
        { status: 404 }
      )
    }

    // 4. Validate that parent is an episode
    // Note: Legacy episodes may not have videoType defined - treat undefined as 'episode'
    const parentVideoType = parentEpisode.videoType ?? 'episode'
    if (parentVideoType !== 'episode') {
      return NextResponse.json(
        { error: { code: 'INVALID_PARENT_TYPE', message: 'Pai deve ser um episodio' } },
        { status: 400 }
      )
    }

    // 5. Update current video with parent info and inherited fields
    const updateData = {
      parentEpisodeId,
      guests: parentEpisode.guests ?? [],
      theme: parentEpisode.theme ?? '',
    }

    await updateVideoAdmin(PODCAST_ID, videoId, updateData)

    log('INFO', 'Parent episode set successfully', {
      userId: session.user.id,
      videoId,
      parentEpisodeId,
      videoType: video.videoType,
      inheritedGuests: parentEpisode.guests?.length ?? 0,
      inheritedTheme: parentEpisode.theme ? 'yes' : 'no',
    })

    return NextResponse.json({
      data: {
        parentEpisodeId,
        guests: parentEpisode.guests ?? [],
        theme: parentEpisode.theme ?? '',
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to set parent episode', {
      userId: session.user.id,
      videoId,
      parentEpisodeId,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao definir episodio pai' } },
      { status: 500 }
    )
  }
}
