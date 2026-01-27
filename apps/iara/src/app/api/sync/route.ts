/**
 * POST /api/sync
 *
 * Synchronizes videos from YouTube to Firestore.
 *
 * Returns:
 * - Success: { data: { added: number, updated: number, deleted: number } }
 * - Error: { error: { code: ErrorCode, message: string } }
 *
 * Error Codes:
 * - AUTH_EXPIRED: Session expired or missing
 * - NO_TOKENS: User has no stored OAuth tokens
 * - TOKEN_REFRESH_FAILED: Failed to refresh expired token
 * - PODCAST_NOT_FOUND: No podcast configured for user
 * - INTERNAL_ERROR: Unexpected server error
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import {
  getUserTokensWithExpiry,
  refreshUserToken,
  TokenRefreshError,
} from '@/lib/firebase/tokens'
import { log } from '@/lib/logger'
import { syncVideos } from '@/lib/sync/sync-videos'

export const runtime = 'nodejs'

export async function POST(_request: NextRequest) {
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
    // Get user tokens from Firestore
    let tokens = await getUserTokensWithExpiry(userId)

    if (!tokens) {
      log('WARN', 'No tokens found for user in sync', { userId })
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
        log('INFO', 'Token refreshed before sync', { userId })
      } catch (error) {
        if (error instanceof TokenRefreshError) {
          log('ERROR', 'Token refresh failed in sync', {
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

    // For MVP single-tenant, use the configured PODCAST_ID
    // In future white-label version, this would come from user's podcast association
    const podcastId = PODCAST_ID

    if (!podcastId) {
      log('ERROR', 'No podcast configured', { userId })
      return NextResponse.json(
        { error: { code: 'PODCAST_NOT_FOUND', message: 'Podcast não configurado.' } },
        { status: 404 }
      )
    }

    // Execute sync
    const result = await syncVideos(podcastId, tokens.accessToken)

    log('INFO', 'Video sync completed via API', {
      userId,
      podcastId,
      ...result,
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    // Handle podcast not found error
    if (error instanceof Error && error.message.includes('Podcast not found')) {
      log('WARN', 'Podcast not found during sync', { userId })
      return NextResponse.json(
        { error: { code: 'PODCAST_NOT_FOUND', message: 'Podcast não encontrado.' } },
        { status: 404 }
      )
    }

    // Handle unexpected errors
    log('ERROR', 'Unexpected error during sync', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro interno ao sincronizar vídeos.' } },
      { status: 500 }
    )
  }
}
