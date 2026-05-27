/**
 * GET /api/videos
 *
 * Returns the list of videos for the current tenant's podcast.
 *
 * Query Parameters:
 * - page: Page number (1-indexed, default: 1)
 * - limit: Videos per page (default: 20, max: 100)
 * - type: Filter by video type (episode, cut, reel)
 * - status: Filter by video status (new, draft, sent, not_sent)
 *
 * Returns:
 * - Success: { data: VideoSummary[], pagination: { page, limit, totalCount, totalPages } }
 * - Error: { error: { code: ErrorCode, message: string } }
 *
 * Error Codes:
 * - AUTH_EXPIRED: Session expired or missing
 * - INTERNAL_ERROR: Unexpected server error
 */

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAuth } from '@/lib/auth/require-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideosForDisplayAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const session = await auth()

  const authError = requireAuth(session)
  if (authError) return authError

  try {
    const searchParams = request.nextUrl.searchParams

    // Parse page with NaN protection
    const parsedPage = parseInt(searchParams.get('page') ?? '1', 10)
    const page = Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage)

    // Parse limit with NaN protection
    const parsedLimit = parseInt(searchParams.get('limit') ?? '20', 10)
    const limit = Number.isNaN(parsedLimit) ? 20 : Math.min(100, Math.max(1, parsedLimit))

    const typeParam = searchParams.get('type')
    const videoType = typeParam && ['episode', 'cut', 'reel'].includes(typeParam)
      ? (typeParam as 'episode' | 'cut' | 'reel')
      : undefined

    const statusParam = searchParams.get('status')
    const status = statusParam && ['new', 'draft', 'sent', 'not_sent'].includes(statusParam)
      ? (statusParam as 'new' | 'draft' | 'sent' | 'not_sent')
      : undefined

    // Vídeo Avulso filter (Epic 25) — orthogonal to type.
    const standalone = searchParams.get('standalone') === 'true' ? true : undefined

    const result = await getVideosForDisplayAdmin(PODCAST_ID, {
      page,
      limit,
      videoType,
      status,
      standalone,
    })

    return NextResponse.json(result)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined

    log('ERROR', 'Failed to get videos via API', {
      userId: session!.user.id,
      podcastId: PODCAST_ID,
      error: errorMessage,
      stack: errorStack,
    })

    // Include error details in development for easier debugging
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: isDev ? errorMessage : 'Erro ao carregar vídeos',
        },
      },
      { status: 500 }
    )
  }
}
