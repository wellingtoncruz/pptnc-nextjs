/**
 * API route for a single social post per video and network.
 *
 * PUT: Updates a social post document in the socialPosts subcollection.
 *
 * Path: podcasts/{podcastId}/videos/{videoId}/socialPosts/{networkId}
 *
 * @see epic-14-redes-sociais.md#Story 14.6
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { upsertSocialPost } from '@/lib/firebase/social-admin'
import { log } from '@/lib/logger'
import { authExpiredResponse, createErrorResponse } from '@/lib/api/video-field-handler'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ videoId: string; networkId: string }>
}

/**
 * PUT /api/videos/[videoId]/social-posts/[networkId]
 *
 * Updates a social post for a specific video and network.
 * Body: { cta: string, body: string, hashtags: string[] }
 * Response: { data: { networkId: string } }
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId, networkId } = await context.params

  try {
    const body = await request.json()
    await upsertSocialPost(videoId, networkId, body)

    log('INFO', 'Social post updated via API', { videoId, networkId })

    return NextResponse.json({ data: { networkId } })
  } catch (error) {
    if (error instanceof SyntaxError) {
      log('WARN', 'Malformed JSON body', { videoId, networkId })
      return createErrorResponse('VALIDATION_ERROR', 'Body inválido', 400)
    }

    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid social post data', { videoId, networkId, issues: error.issues })
      return createErrorResponse('VALIDATION_ERROR', 'Dados do post inválidos', 400)
    }

    log('ERROR', 'Failed to update social post', {
      videoId,
      networkId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao salvar post social', 500)
  }
}
