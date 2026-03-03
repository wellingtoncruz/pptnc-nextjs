/**
 * POST /api/news/[newsId]/find-episodes
 *
 * Finds similar episodes for a news item using vector search.
 * Generates embedding if needed, caches related_videos for subsequent calls.
 *
 * Returns:
 * - Success: { data: { episodes: VideoSummary[] } }
 * - 401: Session expired
 * - 404: News not found
 * - 500: Internal error
 *
 * @see Story 18.3 — Embedding de Notícias + Busca de Episódios Similares
 */

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { findEpisodesForNews } from '@/lib/news/find-episodes'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ newsId: string }>
}

export async function POST(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { newsId } = await context.params

  if (!newsId || typeof newsId !== 'string') {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'newsId inválido' } },
      { status: 400 }
    )
  }

  try {
    const episodes = await findEpisodesForNews(PODCAST_ID, newsId)

    return NextResponse.json({
      data: { episodes },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (errorMessage === 'News not found') {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Notícia não encontrada' } },
        { status: 404 }
      )
    }

    log('ERROR', 'Failed to find episodes for news', {
      podcastId: PODCAST_ID,
      newsId,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao buscar episódios relacionados' } },
      { status: 500 }
    )
  }
}
