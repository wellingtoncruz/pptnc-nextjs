/**
 * POST /api/sync/full
 *
 * Performs a full sync of all videos from YouTube.
 * Updates metadata for ALL videos, not just new ones.
 *
 * This is a HIGH QUOTA operation - requires admin access and confirmation.
 *
 * Returns:
 * - Success: { data: { total, updated, added, unchanged } }
 * - Error: { error: { code: ErrorCode, message: string } }
 *
 * Error Codes:
 * - AUTH_EXPIRED: Session expired or missing
 * - FORBIDDEN: User is not an admin
 * - NO_TOKENS: User has no stored OAuth tokens
 * - TOKEN_REFRESH_FAILED: Failed to refresh expired token
 * - PODCAST_NOT_FOUND: No podcast configured
 * - SYNC_IN_PROGRESS: Another full sync is already running
 * - INTERNAL_ERROR: Unexpected server error
 *
 * @see docs/stories/9-6-resync-completo.md
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAuth, requireAdmin } from '@/lib/auth/require-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import {
  getUserTokensWithExpiry,
  refreshUserToken,
  TokenRefreshError,
} from '@/lib/firebase/tokens'
import { log } from '@/lib/logger'
import { fullSyncVideos, getFullSyncLockStatus } from '@/lib/sync/full-sync-videos'

export const runtime = 'nodejs'

export async function POST(_request: NextRequest) {
  // Get session
  const session = await auth()

  // Check authentication
  const authError = requireAuth(session)
  if (authError) {
    return authError
  }

  // Check admin role
  const adminCheck = requireAdmin(session!)
  if (!adminCheck.authorized) {
    return adminCheck.response
  }

  const userId = session!.user.id

  try {
    // Check if a sync is already in progress
    const lockStatus = await getFullSyncLockStatus(PODCAST_ID)
    if (lockStatus.inProgress) {
      log('WARN', 'Full sync blocked - already in progress', {
        userId,
        startedBy: lockStatus.startedBy,
        startedAt: lockStatus.startedAt,
      })
      return NextResponse.json(
        { error: { code: 'SYNC_IN_PROGRESS', message: 'Re-sync já em andamento, aguarde' } },
        { status: 409 }
      )
    }

    // Get user tokens from Firestore
    let tokens = await getUserTokensWithExpiry(userId)

    if (!tokens) {
      log('WARN', 'No tokens found for user in full sync', { userId })
      return NextResponse.json(
        { error: { code: 'NO_TOKENS', message: 'Tokens OAuth não encontrados. Reconecte sua conta Google.' } },
        { status: 401 }
      )
    }

    // Refresh token if expired
    if (tokens.needsRefresh) {
      if (!tokens.refreshToken) {
        log('ERROR', 'Token expired and no refresh token available in full sync', { userId })
        return NextResponse.json(
          { error: { code: 'AUTH_EXPIRED', message: 'Token expirado. Reconecte sua conta Google.' } },
          { status: 401 }
        )
      }

      try {
        tokens = await refreshUserToken(userId, tokens.refreshToken)
        log('INFO', 'Token refreshed before full sync', { userId })
      } catch (error) {
        if (error instanceof TokenRefreshError) {
          log('ERROR', 'Token refresh failed in full sync', {
            userId,
            status: error.status,
            message: error.message,
          })
          return NextResponse.json(
            { error: { code: 'TOKEN_REFRESH_FAILED', message: 'Falha ao renovar token. Reconecte sua conta Google.' } },
            { status: 401 }
          )
        }
        throw error
      }
    }

    // For MVP single-tenant, use the configured PODCAST_ID
    const podcastId = PODCAST_ID

    if (!podcastId) {
      log('ERROR', 'No podcast configured for full sync', { userId })
      return NextResponse.json(
        { error: { code: 'PODCAST_NOT_FOUND', message: 'Podcast não configurado.' } },
        { status: 404 }
      )
    }

    // Execute full sync
    const result = await fullSyncVideos(podcastId, tokens.accessToken, userId)

    log('INFO', 'Full video sync completed via API', {
      userId,
      podcastId,
      ...result,
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    // Handle sync in progress error (from lock acquisition)
    if (error instanceof Error && error.message.includes('Re-sync já em andamento')) {
      return NextResponse.json(
        { error: { code: 'SYNC_IN_PROGRESS', message: error.message } },
        { status: 409 }
      )
    }

    // Handle podcast not found error
    if (error instanceof Error && error.message.includes('Podcast não encontrado')) {
      log('WARN', 'Podcast not found during full sync', { userId })
      return NextResponse.json(
        { error: { code: 'PODCAST_NOT_FOUND', message: 'Podcast não encontrado.' } },
        { status: 404 }
      )
    }

    // Handle unexpected errors
    log('ERROR', 'Unexpected error during full sync', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro interno ao sincronizar vídeos.' } },
      { status: 500 }
    )
  }
}
