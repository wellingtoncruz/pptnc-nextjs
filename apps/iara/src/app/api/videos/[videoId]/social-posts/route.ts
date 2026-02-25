/**
 * API route for social posts per video.
 *
 * GET: Returns all social posts from the socialPosts subcollection.
 *
 * Path: podcasts/{podcastId}/videos/{videoId}/socialPosts
 *
 * @see epic-14-redes-sociais.md#Story 14.6
 */

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { getSocialPosts } from '@/lib/firebase/social-admin'
import { log } from '@/lib/logger'
import { authExpiredResponse, createErrorResponse } from '@/lib/api/video-field-handler'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * GET /api/videos/[videoId]/social-posts
 *
 * Returns all social posts for a video.
 * Response: { data: SocialPost[] }
 */
export async function GET(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params

  try {
    const posts = await getSocialPosts(videoId)
    return NextResponse.json({ data: posts })
  } catch (error) {
    log('ERROR', 'Failed to get social posts', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao carregar posts sociais', 500)
  }
}
