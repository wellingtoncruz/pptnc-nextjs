/**
 * POST /api/videos/[videoId]/reopen
 *
 * Reopens a video with status 'sent' for metadata editing.
 *
 * Verifies the video's current privacy status on YouTube before reopening.
 * The video must be either 'private' (without scheduled publishing) or 'unlisted'.
 * Public or scheduled videos cannot be reopened.
 *
 * Returns:
 * - Success: { data: { videoId, status: 'draft' } }
 * - Error: { error: { code: ErrorCode, message: string } }
 *
 * @see Story 11-2 - Reabrir Episódio para Edição
 */

import { NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import {
  getUserTokensWithExpiry,
  refreshUserToken,
  TokenRefreshError,
} from '@/lib/firebase/tokens'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import { transition } from '@/lib/video-state-machine/transitions'
import { YouTubeAPIError, YouTubeClient } from '@/lib/youtube'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ videoId: string }>
}

export async function POST(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessao expirada. Faca login novamente.' } },
      { status: 401 }
    )
  }

  const userId = session.user.id
  const { videoId } = await context.params

  try {
    // 1. Get video from Firestore and validate status is 'sent'
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Video nao encontrado' } },
        { status: 404 }
      )
    }

    if (video.status !== 'sent') {
      log('WARN', 'Cannot reopen video - status is not sent', {
        videoId,
        currentStatus: video.status,
      })
      return NextResponse.json(
        { error: { code: 'INVALID_STATUS', message: `Video com status "${video.status}" nao pode ser reaberto. Apenas videos com status "sent" podem ser reabertos.` } },
        { status: 400 }
      )
    }

    // 2. Get user tokens from Firestore
    let tokens = await getUserTokensWithExpiry(userId)

    if (!tokens) {
      log('WARN', 'No tokens found for user in reopen', { userId, videoId })
      return NextResponse.json(
        { error: { code: 'NO_TOKENS', message: 'Tokens OAuth nao encontrados. Faca login novamente.' } },
        { status: 401 }
      )
    }

    // 3. Refresh token if expired
    if (tokens.needsRefresh) {
      if (!tokens.refreshToken) {
        log('ERROR', 'Token expired and no refresh token available for reopen', { userId, videoId })
        return NextResponse.json(
          { error: { code: 'AUTH_EXPIRED', message: 'Token expirado. Faca login novamente.' } },
          { status: 401 }
        )
      }

      try {
        tokens = await refreshUserToken(userId, tokens.refreshToken)
        log('INFO', 'Token refreshed before reopen check', { userId, videoId })
      } catch (error) {
        if (error instanceof TokenRefreshError) {
          log('ERROR', 'Token refresh failed in reopen', {
            userId,
            videoId,
            status: error.status,
            message: error.message,
          })
          return NextResponse.json(
            { error: { code: 'TOKEN_REFRESH_FAILED', message: 'Falha ao renovar token. Faca login novamente.' } },
            { status: 401 }
          )
        }
        throw error
      }
    }

    // 4. Check YouTube eligibility
    const client = new YouTubeClient(tokens.accessToken)
    const eligibility = await client.checkVideoEligibility(videoId)

    if (!eligibility.eligible) {
      log('INFO', 'Video not eligible for reopen', {
        videoId,
        privacyStatus: eligibility.privacyStatus,
        publishAt: eligibility.publishAt,
      })
      return NextResponse.json(
        { error: { code: 'VIDEO_NOT_ELIGIBLE', message: 'O video nao esta com o status adequado no YouTube. Nao e possivel reabrir. Altere o video para Nao Listado.' } },
        { status: 409 }
      )
    }

    // 5. Execute state transition and update Firestore
    const newStatus = transition('sent', 'reopen')

    await updateVideoAdmin(PODCAST_ID, videoId, {
      status: newStatus,
      youtubePrivacyStatus: eligibility.privacyStatus,
      visibilityUpdatedAt: Timestamp.now(),
    })

    log('INFO', 'Video reopened for editing', {
      userId,
      videoId,
      previousStatus: 'sent',
      newStatus,
      youtubePrivacyStatus: eligibility.privacyStatus,
    })

    return NextResponse.json({
      data: {
        videoId,
        status: newStatus,
      },
    })
  } catch (error) {
    if (error instanceof YouTubeAPIError) {
      log('WARN', 'YouTube API error in reopen check', {
        userId,
        videoId,
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

    log('ERROR', 'Unexpected error reopening video', {
      userId,
      videoId,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro interno ao verificar video no YouTube.' } },
      { status: 500 }
    )
  }
}
