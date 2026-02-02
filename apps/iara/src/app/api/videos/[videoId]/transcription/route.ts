/**
 * POST /api/videos/[videoId]/transcription
 *
 * Fetches transcription on-demand for a video.
 * Downloads Portuguese captions from YouTube and saves to Firestore.
 *
 * @see Story 5.6 - Transcrição On-Demand
 *
 * Returns:
 * - Success: { data: { transcriptionSRT: string, transcriptionTXT: string } }
 * - Error: { error: { code: ErrorCode, message: string } }
 *
 * Error Codes:
 * - AUTH_EXPIRED: Session expired or missing
 * - NO_TOKENS: User has no stored OAuth tokens
 * - TOKEN_REFRESH_FAILED: Failed to refresh expired token
 * - NOT_FOUND: Video not found
 * - TRANSCRIPTION_UNAVAILABLE: No Portuguese captions available (video still processing)
 * - QUOTA_EXCEEDED: YouTube API quota exceeded
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
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import { parseSrtToText } from '@/lib/srt-parser'
import { YouTubeClient, YouTubeAPIError } from '@/lib/youtube'

export const runtime = 'nodejs' // REQUIRED for firebase-admin

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * POST /api/videos/[videoId]/transcription
 *
 * Fetches Portuguese transcription from YouTube and saves to Firestore.
 * Called on-demand when producer selects a video without transcription.
 */
export async function POST(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  // Get session
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada. Faça login novamente.' } },
      { status: 401 }
    )
  }

  const userId = session.user.id
  const { videoId } = await context.params

  try {
    // Get user tokens from Firestore
    let tokens = await getUserTokensWithExpiry(userId)

    if (!tokens) {
      log('WARN', 'No tokens found for user in transcription fetch', { userId, videoId })
      return NextResponse.json(
        { error: { code: 'NO_TOKENS', message: 'Tokens OAuth não encontrados. Faça login novamente.' } },
        { status: 401 }
      )
    }

    // Refresh token if expired
    if (tokens.needsRefresh) {
      if (!tokens.refreshToken) {
        log('ERROR', 'Token expired and no refresh token available', { userId, videoId })
        return NextResponse.json(
          { error: { code: 'AUTH_EXPIRED', message: 'Token expirado. Faça login novamente.' } },
          { status: 401 }
        )
      }

      try {
        tokens = await refreshUserToken(userId, tokens.refreshToken)
        log('INFO', 'Token refreshed before transcription fetch', { userId, videoId })
      } catch (error) {
        if (error instanceof TokenRefreshError) {
          log('ERROR', 'Token refresh failed in transcription fetch', {
            userId,
            videoId,
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

    // Check video exists
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
        { status: 404 }
      )
    }

    // Download Portuguese captions from YouTube
    const client = new YouTubeClient(tokens.accessToken)
    const srt = await client.downloadPortugueseCaptions(videoId)

    if (!srt) {
      log('INFO', 'Transcription not available for video', { videoId })
      return NextResponse.json(
        {
          error: {
            code: 'TRANSCRIPTION_UNAVAILABLE',
            message: 'Esse vídeo ainda está em processamento pelo YouTube, tente novamente em alguns minutos',
          },
        },
        { status: 404 }
      )
    }

    // Convert SRT to plain text
    const txt = parseSrtToText(srt)

    // Save transcription to Firestore
    await updateVideoAdmin(PODCAST_ID, videoId, {
      transcriptionSRT: srt,
      transcriptionTXT: txt,
    })

    log('INFO', 'Transcription fetched and saved', {
      videoId,
      srtLength: srt.length,
      txtLength: txt.length,
    })

    return NextResponse.json({
      data: {
        transcriptionSRT: srt,
        transcriptionTXT: txt,
      },
    })
  } catch (error) {
    // Handle YouTube API errors
    if (error instanceof YouTubeAPIError) {
      if (error.code === 'YOUTUBE_QUOTA') {
        log('WARN', 'YouTube quota exceeded during transcription fetch', { videoId })
        return NextResponse.json(
          {
            error: {
              code: 'QUOTA_EXCEEDED',
              message: 'Limite de requisições atingido, tente novamente mais tarde',
            },
          },
          { status: 429 }
        )
      }

      log('ERROR', 'YouTube API error during transcription fetch', {
        videoId,
        code: error.code,
        message: error.message,
      })
    }

    // Handle unexpected errors
    log('ERROR', 'Unexpected error during transcription fetch', {
      userId,
      videoId,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Ocorreu um erro inesperado, tente novamente' } },
      { status: 500 }
    )
  }
}
