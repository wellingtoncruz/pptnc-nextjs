/**
 * GET /api/editorial/episodes
 *
 * Returns episode summaries for the Editorial section grid.
 * Only returns videos with videoType === 'episode'.
 *
 * Query params:
 * - limit: number (default 16) - Number of episodes to return
 * - search: string - Search term for title filter (case-insensitive)
 *
 * Returns:
 * - Success: { data: EpisodeSummary[] }
 * - Error: { error: { code: ErrorCode, message: string } }
 *
 * @see architecture-iara.md#Route-Handlers
 */

import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getAdminDb } from '@/lib/firebase/admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 16

interface EpisodeSummary {
  id: string
  title: string
  description?: string
  status: string
  thumbnailUrl?: string
  publishedAt?: string
}

/**
 * Parses publishedAt from various Firestore formats to Date.
 */
function parsePublishedAt(value: unknown): Date {
  if (!value) return new Date(0)
  if (typeof value === 'string') return new Date(value)
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    return new Date((value as { _seconds: number })._seconds * 1000)
  }
  return new Date(0)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const limitParam = searchParams.get('limit')
  const search = searchParams.get('search')

  let limit = DEFAULT_LIMIT
  if (limitParam) {
    const parsed = parseInt(limitParam, 10)
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 50)
    }
  }

  try {
    const db = getAdminDb()
    const videosRef = db.collection('podcasts').doc(PODCAST_ID).collection('videos')

    const snapshot = await videosRef
      .where('videoType', '==', 'episode')
      .select('title', 'description', 'status', 'thumbnails', 'storageThumbnailUrl', 'publishedAt')
      .get()

    if (snapshot.empty) {
      log('INFO', 'No episodes found for editorial', { podcastId: PODCAST_ID })
      return NextResponse.json({ data: [] })
    }

    // Map to EpisodeSummary and sort by publishedAt desc
    const episodes: Array<EpisodeSummary & { _sortDate: Date }> = []

    for (const doc of snapshot.docs) {
      const data = doc.data()
      const publishedAt = parsePublishedAt(data.publishedAt)

      // Determine best thumbnail URL
      const thumbnailUrl = data.storageThumbnailUrl
        || data.thumbnails?.high?.url
        || data.thumbnails?.medium?.url
        || data.thumbnails?.default?.url
        || undefined

      episodes.push({
        id: doc.id,
        title: data.title ?? 'Sem título',
        description: data.description || undefined,
        status: data.status ?? 'new',
        thumbnailUrl,
        publishedAt: publishedAt.getTime() > 0 ? publishedAt.toISOString() : undefined,
        _sortDate: publishedAt,
      })
    }

    episodes.sort((a, b) => b._sortDate.getTime() - a._sortDate.getTime())

    // Filter by search term if provided
    let result: EpisodeSummary[]
    if (search) {
      const searchLower = search.toLowerCase()
      result = episodes
        .filter((ep) => ep.title.toLowerCase().includes(searchLower))
        .map(({ _sortDate, ...ep }) => ep)
    } else {
      result = episodes
        .slice(0, limit)
        .map(({ _sortDate, ...ep }) => ep)
    }

    log('INFO', 'Editorial episodes fetched', {
      podcastId: PODCAST_ID,
      count: result.length,
      total: episodes.length,
      hasSearch: !!search,
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to fetch editorial episodes', {
      podcastId: PODCAST_ID,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao carregar episódios' } },
      { status: 500 }
    )
  }
}
