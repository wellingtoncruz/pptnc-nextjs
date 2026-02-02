/**
 * GET /api/videos/[videoId]
 *
 * Returns a single video by ID with all its data from Firestore.
 * Used by wizard-orchestrator to fetch fresh data when navigating between videos.
 *
 * This is critical for Smart Loading (Story 5.3) - ensures we have the latest
 * data from Firestore, not stale data from the video list prop.
 *
 * PATCH /api/videos/[videoId]
 *
 * Updates video fields in Firestore.
 * Used to update video status after sending to YouTube.
 *
 * Returns:
 * - Success: { data: Video }
 * - Error: { error: { code: ErrorCode, message: string } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'

/**
 * Schema for PATCH request body.
 */
const VideoUpdateRequestSchema = z.object({
  status: z.enum(['new', 'processing', 'draft', 'ready', 'sending', 'sent']).optional(),
}).passthrough()

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ videoId: string }>
}

export async function GET(
  _request: NextRequest,
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

  try {
    const video = await getVideoAdmin(PODCAST_ID, videoId)

    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Video nao encontrado' } },
        { status: 404 }
      )
    }

    log('INFO', 'Video fetched successfully', { videoId })

    return NextResponse.json({ data: video })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to get video', {
      userId: session.user.id,
      videoId,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao carregar video' } },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/videos/[videoId]
 *
 * Updates video fields in Firestore.
 */
export async function PATCH(
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

  try {
    const body = await request.json()
    const validated = VideoUpdateRequestSchema.parse(body)

    await updateVideoAdmin(PODCAST_ID, videoId, validated)

    log('INFO', 'Video updated successfully', { videoId, fields: Object.keys(validated) })

    return NextResponse.json({ data: { success: true } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos' } },
        { status: 400 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to update video', {
      userId: session.user.id,
      videoId,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao atualizar video' } },
      { status: 500 }
    )
  }
}
