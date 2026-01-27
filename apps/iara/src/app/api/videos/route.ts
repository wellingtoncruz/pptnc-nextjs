/**
 * GET /api/videos
 *
 * Returns the list of videos for the current tenant's podcast.
 *
 * Query Parameters:
 * - page: Page number (1-indexed, default: 1)
 * - limit: Videos per page (default: 20, max: 100)
 * - type: Filter by video type (episode, cut, reel)
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
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideosForDisplayAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const typeParam = searchParams.get('type')
    const videoType = typeParam && ['episode', 'cut', 'reel'].includes(typeParam)
      ? (typeParam as 'episode' | 'cut' | 'reel')
      : undefined

    const result = await getVideosForDisplayAdmin(PODCAST_ID, {
      page,
      limit,
      videoType,
    })

    return NextResponse.json(result)
  } catch (error) {
    log('ERROR', 'Failed to get videos via API', {
      userId: session.user.id,
      podcastId: PODCAST_ID,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao carregar vídeos' } },
      { status: 500 }
    )
  }
}
