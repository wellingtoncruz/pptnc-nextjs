/**
 * GET /api/videos/episodes
 *
 * Returns a list of episodes available for parent selection (cut/reel).
 * Only returns episodes that have context defined (theme field populated).
 * Used by Phase 0 (Parent Selection) for cut and reel videos.
 *
 * Query params:
 * - limit: number (default 5, max 50) - Number of episodes to return
 * - search: string (min 5 chars) - Search term for title filter
 *
 * Returns:
 * - Success: { data: VideoSummary[] }
 * - Error: { error: { code: ErrorCode, message: string } }
 */

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getEpisodesWithContext } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 50
const MIN_SEARCH_LENGTH = 5

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessao expirada' } },
      { status: 401 }
    )
  }

  // Parse query params
  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get('limit')
  const search = searchParams.get('search')

  // Validate limit
  let limit = DEFAULT_LIMIT
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10)
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, MAX_LIMIT)
    }
  }

  // Validate search (min 5 chars if provided)
  if (search && search.length < MIN_SEARCH_LENGTH) {
    return NextResponse.json(
      { error: { code: 'INVALID_SEARCH', message: `Busca deve ter pelo menos ${MIN_SEARCH_LENGTH} caracteres` } },
      { status: 400 }
    )
  }

  try {
    // When searching, fetch more results to filter client-side
    const fetchLimit = search ? MAX_LIMIT : limit
    const episodes = await getEpisodesWithContext(PODCAST_ID, fetchLimit)

    // Filter by search term if provided
    let filteredEpisodes = episodes
    if (search) {
      const searchLower = search.toLowerCase()
      filteredEpisodes = episodes
        .filter((ep) => ep.title.toLowerCase().includes(searchLower))
        .slice(0, 10) // Return max 10 search results
    }

    log('INFO', 'Episodes fetched for parent selection', {
      userId: session.user.id,
      count: filteredEpisodes.length,
      limit,
      hasSearch: !!search,
    })

    return NextResponse.json({ data: filteredEpisodes })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to get episodes', {
      userId: session.user.id,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao carregar episodios' } },
      { status: 500 }
    )
  }
}
