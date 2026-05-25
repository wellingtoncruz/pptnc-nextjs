/**
 * POST /api/videos/[videoId]/reopen
 *
 * Reopens a video with status 'sent' for metadata editing.
 *
 * Reopening is a purely editorial decision (ADR-25.4): it does NOT check the
 * video's privacy status on YouTube. Any 'sent' video can be reopened to
 * 'draft' at the producer's discretion.
 *
 * Returns:
 * - Success: { data: { videoId, status: 'draft' } }
 * - Error: { error: { code: ErrorCode, message: string } }
 *
 * @see Story 11-2 - Reabrir Episódio para Edição
 * @see Story 25.11 - Reabertura desacoplada do YouTube (ADR-25.4)
 */

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import { transition } from '@/lib/video-state-machine/transitions'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ videoId: string }>
}

export async function POST(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessao expirada. Faca login novamente.' } },
      { status: 401 }
    )
  }

  const userId = session.user.id
  const { videoId } = await context.params

  try {
    // 1. Get video from Firestore and validate status is 'sent'
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Video nao encontrado' } },
        { status: 404 }
      )
    }

    if (video.status !== 'sent') {
      log('WARN', 'Cannot reopen video - status is not sent', {
        videoId,
        currentStatus: video.status,
      })
      return NextResponse.json(
        { error: { code: 'INVALID_STATUS', message: `Video com status "${video.status}" nao pode ser reaberto. Apenas videos com status "sent" podem ser reabertos.` } },
        { status: 400 }
      )
    }

    // 2. Execute state transition and update Firestore.
    // Editorial-only — no YouTube eligibility check (ADR-25.4).
    const newStatus = transition('sent', 'reopen')

    await updateVideoAdmin(PODCAST_ID, videoId, {
      status: newStatus,
    })

    log('INFO', 'Video reopened for editing', {
      userId,
      videoId,
      previousStatus: 'sent',
      newStatus,
    })

    return NextResponse.json({
      data: {
        videoId,
        status: newStatus,
      },
    })
  } catch (error) {
    log('ERROR', 'Unexpected error reopening video', {
      userId,
      videoId,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro interno ao reabrir o video.' } },
      { status: 500 }
    )
  }
}
