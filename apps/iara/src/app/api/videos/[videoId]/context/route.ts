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
  // Accept '' as "not filled yet" — auto-save fires while the producer is still
  // typing; rejecting empty strings would surface a 400 every keystroke. The
  // empty value is normalized to undefined below before persisting.
  theme: z.string().min(1, 'Tema é obrigatório').optional().or(z.literal('')),
  guests: z.array(GuestSchema).optional(),
  parentEpisodeId: z.string().min(1).optional().or(z.literal('')),
  spotifyUrl: z.string()
    .url('URL inválida')
    .refine(
      (url) => url.startsWith('https://open.spotify.com/') || url.startsWith('https://spti.fi/'),
      'URL deve ser do Spotify (open.spotify.com ou spti.fi)'
    )
    .optional()
    .or(z.literal('')),
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
        spotifyUrl: video.spotifyUrl ?? null,
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

    // Normalize empty-string sentinels to undefined so we don't persist '' as
    // a meaningful theme/parent. The schema accepts '' for incremental typing
    // (see ContextUpdateSchema comment) but Firestore should see undefined.
    const persistable: Record<string, unknown> = { ...contextData }
    if (persistable.theme === '') delete persistable.theme
    if (persistable.parentEpisodeId === '') delete persistable.parentEpisodeId

    await updateVideoAdmin(PODCAST_ID, videoId, persistable)

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
      // Surface the first refine/url message so the producer sees what to fix
      // (e.g., Spotify URL malformed). Story 24.6.
      const firstIssue = error.issues[0]
      const message = firstIssue?.message || 'Dados de contexto inválidos'
      const field = firstIssue?.path.join('.') || undefined
      log('WARN', 'Invalid context data', { videoId, field, message })
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message, field } },
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
