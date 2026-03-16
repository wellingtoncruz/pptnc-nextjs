/**
 * POST /api/news/[newsId]/search-episodes
 *
 * Searches episodes by title for manual episode selection in the news workspace.
 * Complements the vector-based find-episodes endpoint with text search.
 *
 * Body: { query: string }
 *
 * Returns:
 * - Success: { data: { episodes: VideoSummary[] } }
 * - 401: Session expired
 * - 400: Missing or empty query
 * - 500: Internal error
 */

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { searchEpisodesByTitle } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ newsId: string }>
}

export async function POST(
  request: NextRequest,
  _context: RouteContext
): Promise<NextResponse> {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const query = typeof body.query === 'string' ? body.query.trim() : ''

    if (!query) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Termo de busca obrigatório' } },
        { status: 400 }
      )
    }

    const episodes = await searchEpisodesByTitle(PODCAST_ID, query)

    return NextResponse.json({
      data: { episodes },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to search episodes by title', {
      podcastId: PODCAST_ID,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao buscar episódios' } },
      { status: 500 }
    )
  }
}
