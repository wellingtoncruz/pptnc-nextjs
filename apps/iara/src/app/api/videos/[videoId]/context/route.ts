/**
 * API route for video context operations.
 *
 * GET: Fetch context (theme, guests, parentEpisodeId) for a video
 * PUT: Update context for a video
 *
 * Context is stored flat on the video document:
 * - theme: string (for episodes)
 * - guests: array of {name, role, company, linkedin, photo} (for episodes)
 * - parentEpisodeId: string (for cuts/reels)
 *
 * @see architecture-iara.md#API Design
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { GuestSchema } from '@/lib/schemas/video'
import { log } from '@/lib/logger'

/**
 * Schema for validating context update request body.
 * Either episode context (theme + guests) or cut/reel context (parentEpisodeId).
 */
const ContextUpdateSchema = z.object({
  theme: z.string().min(1).optional(),
  guests: z.array(GuestSchema).optional(),
  parentEpisodeId: z.string().min(1).optional(),
})

export const runtime = 'nodejs' // REQUIRED for firebase-admin

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * GET /api/videos/[videoId]/context
 *
 * Fetches the context (theme, guests, parentEpisodeId) for a video.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { videoId } = await context.params

  try {
    const video = await getVideoAdmin(PODCAST_ID, videoId)

    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
        { status: 404 }
      )
    }

    return NextResponse.json({
      data: {
        videoId,
        theme: video.theme ?? null,
        guests: video.guests ?? null,
        parentEpisodeId: video.parentEpisodeId ?? null,
      },
    })
  } catch (error) {
    log('ERROR', 'Failed to get video context', { videoId, error })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao buscar contexto' } },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/videos/[videoId]/context
 *
 * Updates the context (theme, guests, parentEpisodeId) for a video.
 * Used before starting AI processing.
 *
 * Context is stored flat on the video document, not nested.
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { videoId } = await context.params

  try {
    const body = await request.json()

    // Validate context with Zod BEFORE persisting
    const contextData = ContextUpdateSchema.parse(body)

    // Check video exists
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
        { status: 404 }
      )
    }

    // Update video with flat context fields
    await updateVideoAdmin(PODCAST_ID, videoId, contextData)

    log('INFO', 'Video context updated', {
      videoId,
      hasTheme: !!contextData.theme,
      guestsCount: contextData.guests?.length ?? 0,
      hasParentEpisodeId: !!contextData.parentEpisodeId,
    })

    return NextResponse.json({
      data: {
        videoId,
        ...contextData,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid context data', { videoId, error })
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Dados de contexto inválidos' } },
        { status: 400 }
      )
    }

    log('ERROR', 'Failed to update video context', { videoId, error })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao salvar contexto' } },
      { status: 500 }
    )
  }
}
