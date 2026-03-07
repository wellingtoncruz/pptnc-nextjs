/**
 * GET /api/news
 *
 * Returns paginated news items for the News section.
 * Uses cursor-based pagination via Firestore startAfter.
 *
 * Query params:
 * - cursor: string (ISO timestamp) - Pagination cursor (importedAt of last item)
 * - limit: number (default 16, max 50) - Items per page
 *
 * Returns:
 * - Success: { data: { items: News[], nextCursor: string | null, totalCount: number } }
 * - Error: { error: { code: ErrorCode, message: string } }
 */

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { listNews, searchNews } from '@/lib/firebase/news-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const search = searchParams.get('search') ?? undefined
  const limitParam = searchParams.get('limit')

  let limit = 16
  if (limitParam) {
    const parsed = parseInt(limitParam, 10)
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 50)
    }
  }

  try {
    const result = search?.trim()
      ? await searchNews(PODCAST_ID, search.trim(), { cursor, limit })
      : await listNews(PODCAST_ID, { cursor, limit })

    const items = result.items.map(item => ({
      ...item,
      importedAt: item.importedAt.toDate().toISOString(),
    }))

    return NextResponse.json({
      data: {
        items,
        nextCursor: result.nextCursor,
        totalCount: result.totalCount,
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to fetch news', {
      podcastId: PODCAST_ID,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao carregar notícias' } },
      { status: 500 }
    )
  }
}
