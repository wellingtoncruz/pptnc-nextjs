/**
 * GET /api/youtube/videos
 *
 * Lists videos from the authenticated user's YouTube channel.
 *
 * Query Parameters:
 * - maxResults: Maximum videos to return (default: 50, max: 50)
 * - pageToken: Page token for pagination (from previous response)
 *
 * Returns:
 * - Success: { data: { videos: YouTubeVideoDataFromAPI[], nextPageToken?: string } }
 * - Error: { error: { code: ErrorCode, message: string } }
 *
 * Error Codes:
 * - AUTH_EXPIRED: Session expired or missing
 * - NO_TOKENS: User has no stored OAuth tokens
 * - TOKEN_REFRESH_FAILED: Failed to refresh expired token
 * - YOUTUBE_QUOTA: YouTube API quota exceeded
 * - YOUTUBE_NOT_FOUND: Channel or resource not found
 * - YOUTUBE_FORBIDDEN: Access forbidden
 * - YOUTUBE_ERROR: Other YouTube API error
 * - INTERNAL_ERROR: Unexpected server error
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import {
  getUserTokensWithExpiry,
  refreshUserToken,
  TokenRefreshError,
} from '@/lib/firebase/tokens'
import { log } from '@/lib/logger'
import { YouTubeAPIError, YouTubeClient } from '@/lib/youtube'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Get session
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada. Faça login novamente.' } },
      { status: 401 }
    )
  }

  const userId = session.user.id

  try {
    // Get query params
    const { searchParams } = new URL(request.url)
    const maxResultsParam = searchParams.get('maxResults')
    const pageToken = searchParams.get('pageToken') || undefined

    // Parse and validate maxResults (default: 50, max: 50)
    let maxResults = 50
    if (maxResultsParam) {
      const parsed = parseInt(maxResultsParam, 10)
      if (!isNaN(parsed) && parsed > 0) {
        maxResults = Math.min(parsed, 50)
      }
    }

    // Get user tokens from Firestore
    let tokens = await getUserTokensWithExpiry(userId)

    if (!tokens) {
      log('WARN', 'No tokens found for user in YouTube API call', { userId })
      return NextResponse.json(
        { error: { code: 'NO_TOKENS', message: 'Tokens OAuth não encontrados. Faça login novamente.' } },
        { status: 401 }
      )
    }

    // Refresh token if expired
    if (tokens.needsRefresh) {
      if (!tokens.refreshToken) {
        log('ERROR', 'Token expired and no refresh token available', { userId })
        return NextResponse.json(
          { error: { code: 'AUTH_EXPIRED', message: 'Token expirado. Faça login novamente.' } },
          { status: 401 }
        )
      }

      try {
        tokens = await refreshUserToken(userId, tokens.refreshToken)
        log('INFO', 'Token refreshed before YouTube API call', { userId })
      } catch (error) {
        if (error instanceof TokenRefreshError) {
          log('ERROR', 'Token refresh failed in YouTube API call', {
            userId,
            status: error.status,
            message: error.message,
          })
          return NextResponse.json(
            { error: { code: 'TOKEN_REFRESH_FAILED', message: 'Falha ao renovar token. Faça login novamente.' } },
            { status: 401 }
          )
        }
        throw error
      }
    }

    // Call YouTube API
    const client = new YouTubeClient(tokens.accessToken)
    const result = await client.listVideos({ maxResults, pageToken })

    log('INFO', 'YouTube videos listed via API', {
      userId,
      count: result.videos.length,
      hasMore: !!result.nextPageToken,
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    // Handle YouTube API errors
    if (error instanceof YouTubeAPIError) {
      log('WARN', 'YouTube API error in list videos', {
        userId,
        code: error.code,
        message: error.message,
        status: error.status,
      })

      const statusCode = error.status || 500
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: statusCode }
      )
    }

    // Handle unexpected errors
    log('ERROR', 'Unexpected error listing YouTube videos', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro interno ao buscar vídeos do YouTube.' } },
      { status: 500 }
    )
  }
}
