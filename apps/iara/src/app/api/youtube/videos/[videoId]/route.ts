/**
 * PUT /api/youtube/videos/[videoId]
 *
 * Updates video metadata on YouTube.
 * Used in Phase 8 of the wizard to publish final metadata.
 *
 * Request Body:
 * - title: Video title (required)
 * - description: Video description with chapters (required)
 * - tags: Array of tags (required)
 *
 * Returns:
 * - Success: { data: { videoId, updated: true } }
 * - Error: { error: { code: ErrorCode, message: string } }
 *
 * Also updates:
 * - Video status to 'sent' on success
 * - Video status to 'ready' on error (no change)
 *
 * @see Story 4.10 - Fase 8 - Atualizar YouTube
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import {
  getUserTokensWithExpiry,
  refreshUserToken,
  TokenRefreshError,
} from '@/lib/firebase/tokens'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { IS_PRODUCTION, PODCAST_ID } from '@/lib/firebase/config'
import { log } from '@/lib/logger'
import { YouTubeAPIError, YouTubeClient } from '@/lib/youtube'
import { transition, canTransition } from '@/lib/video-state-machine/transitions'

export const runtime = 'nodejs'

/**
 * Schema for validating video update request body.
 */
const VideoUpdateSchema = z.object({
  title: z.string().min(1, 'Titulo obrigatorio').max(100, 'Titulo muito longo'),
  description: z.string().min(1, 'Descricao obrigatoria').max(5000, 'Descricao muito longa'),
  tags: z.array(z.string()).min(1, 'Pelo menos uma tag obrigatoria'),
})

interface RouteContext {
  params: Promise<{ videoId: string }>
}

export async function PUT(
  request: NextRequest,
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

  // TRAVA DE SEGURANÇA (Epic 27 append): publicação final no YouTube só é
  // permitida em produção (ENVIRONMENT=PRD). Em ambiente de testes (default DEV)
  // bloqueia, evitando que dados de teste subam ao YouTube por engano. É o lock
  // real (o botão desabilitado é só UX; isto não pode ser burlado).
  if (!IS_PRODUCTION) {
    log('WARN', 'Blocked YouTube publish in non-production environment', { videoId })
    return NextResponse.json(
      { error: { code: 'ENV_NOT_AUTHORIZED', message: 'Ambiente de testes, publicação final não autorizada' } },
      { status: 403 }
    )
  }

  try {
    // Parse and validate request body
    const body = await request.json()
    const { title, description, tags } = VideoUpdateSchema.parse(body)

    // Get video to verify it exists and check status
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Video nao encontrado' } },
        { status: 404 }
      )
    }

    // Verify video has a status
    const currentStatus = video.status ?? 'new'

    // Verify video is in correct status to send
    if (!canTransition(currentStatus, 'send')) {
      log('WARN', 'Cannot send video - invalid status transition', {
        videoId,
        currentStatus,
      })
      return NextResponse.json(
        { error: { code: 'INVALID_STATUS', message: `Video com status "${currentStatus}" nao pode ser enviado` } },
        { status: 400 }
      )
    }

    // Update status to 'sending'
    const sendingStatus = transition(currentStatus, 'send')
    await updateVideoAdmin(PODCAST_ID, videoId, { status: sendingStatus })

    // Get user tokens from Firestore
    let tokens = await getUserTokensWithExpiry(userId)

    if (!tokens) {
      // Revert status on token error
      await updateVideoAdmin(PODCAST_ID, videoId, { status: currentStatus })
      log('WARN', 'No tokens found for user in YouTube update', { userId, videoId })
      return NextResponse.json(
        { error: { code: 'NO_TOKENS', message: 'Tokens OAuth nao encontrados. Faca login novamente.' } },
        { status: 401 }
      )
    }

    // Refresh token if expired
    if (tokens.needsRefresh) {
      if (!tokens.refreshToken) {
        await updateVideoAdmin(PODCAST_ID, videoId, { status: currentStatus })
        log('ERROR', 'Token expired and no refresh token available', { userId, videoId })
        return NextResponse.json(
          { error: { code: 'AUTH_EXPIRED', message: 'Token expirado. Faca login novamente.' } },
          { status: 401 }
        )
      }

      try {
        tokens = await refreshUserToken(userId, tokens.refreshToken)
        log('INFO', 'Token refreshed before YouTube update', { userId, videoId })
      } catch (error) {
        await updateVideoAdmin(PODCAST_ID, videoId, { status: currentStatus })
        if (error instanceof TokenRefreshError) {
          log('ERROR', 'Token refresh failed in YouTube update', {
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

    // Call YouTube API to update video
    const client = new YouTubeClient(tokens.accessToken)

    try {
      await client.updateVideo({
        videoId,
        title,
        description,
        tags,
      })

      // Update status to 'sent' on success
      const sentStatus = transition(sendingStatus, 'success')
      await updateVideoAdmin(PODCAST_ID, videoId, { status: sentStatus })

      log('INFO', 'YouTube video updated successfully', {
        userId,
        videoId,
        titleLength: title.length,
        descriptionLength: description.length,
        tagCount: tags.length,
        newStatus: sentStatus,
      })

      return NextResponse.json({
        data: {
          videoId,
          updated: true,
        },
      })
    } catch (error) {
      // Revert status on YouTube API error
      const errorStatus = transition(sendingStatus, 'error')
      await updateVideoAdmin(PODCAST_ID, videoId, { status: errorStatus })

      if (error instanceof YouTubeAPIError) {
        log('WARN', 'YouTube API error in video update', {
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

      throw error
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid video update data', { videoId, error })
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Dados invalidos' } },
        { status: 400 }
      )
    }

    log('ERROR', 'Unexpected error updating YouTube video', {
      userId,
      videoId,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro interno ao atualizar video no YouTube.' } },
      { status: 500 }
    )
  }
}
