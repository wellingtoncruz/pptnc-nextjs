/**
 * API route for video title operations.
 *
 * PUT: Update the video title (selected from AI suggestions)
 *
 * Title is stored flat on the video document at root level.
 *
 * @see processamento_video.md - Fase 5 - Titulo
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { log } from '@/lib/logger'
import {
  authExpiredResponse,
  notFoundResponse,
  handleVideoFieldError,
} from '@/lib/api/video-field-handler'

/**
 * Schema for validating title update request body.
 */
const TitleUpdateSchema = z.object({
  title: z.string().min(1, 'Titulo e obrigatorio').max(100, 'Titulo muito longo'),
})

export const runtime = 'nodejs' // REQUIRED for firebase-admin

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * PUT /api/videos/[videoId]/title
 *
 * Updates the title for a video.
 * Used when user selects a title from AI suggestions in Phase 5.
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params

  try {
    const body = await request.json()

    // Validate title with Zod BEFORE persisting
    const { title } = TitleUpdateSchema.parse(body)

    // Check video exists
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return notFoundResponse('Video')
    }

    // Update video with new title
    await updateVideoAdmin(PODCAST_ID, videoId, { title })

    log('INFO', 'Video title updated', {
      videoId,
      titleLength: title.length,
    })

    return NextResponse.json({
      data: {
        videoId,
        title,
      },
    })
  } catch (error) {
    return handleVideoFieldError(error, 'titulo', videoId)
  }
}
