/**
 * API route for video short title operations.
 *
 * PUT: Update the video short title (selected from AI suggestions in Phase 5B)
 *
 * Short title is used for YouTube thumbnails where space is limited.
 * Only applicable to cut videos (phase 5B is exclusive to cuts).
 *
 * @see Story 4 - Cut Flow (Phase 5B)
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
 * Schema for validating short title update request body.
 * Short titles should be concise (15-50 chars) for thumbnails.
 */
const ShortTitleUpdateSchema = z.object({
  shortTitle: z.string().min(1, 'Título curto é obrigatório').max(50, 'Título curto muito longo'),
})

export const runtime = 'nodejs' // REQUIRED for firebase-admin

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * PUT /api/videos/[videoId]/short-title
 *
 * Updates the short title for a cut video.
 * Used when user selects a short title from AI suggestions in Phase 5B.
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

    // Validate short title with Zod BEFORE persisting
    const { shortTitle } = ShortTitleUpdateSchema.parse(body)

    // Check video exists
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return notFoundResponse('Video')
    }

    // Validate video is a cut (only cuts have short titles)
    if (video.videoType !== 'cut') {
      return NextResponse.json(
        { error: { code: 'INVALID_VIDEO_TYPE', message: 'Título curto é exclusivo para vídeos do tipo cut' } },
        { status: 400 }
      )
    }

    // Update video with new short title
    await updateVideoAdmin(PODCAST_ID, videoId, { shortTitle })

    log('INFO', 'Video short title updated', {
      videoId,
      shortTitleLength: shortTitle.length,
    })

    return NextResponse.json({
      data: {
        videoId,
        shortTitle,
      },
    })
  } catch (error) {
    return handleVideoFieldError(error, 'título curto', videoId)
  }
}
