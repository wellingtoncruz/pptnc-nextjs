/**
 * API route for video suggested titles operations.
 *
 * PUT: Update a single suggested title at a specific index
 *
 * suggestedTitles is stored as an array on the video document.
 *
 * @see Story 10-7 - Editable suggested titles
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
 * Schema for validating suggested title update request body.
 */
const SuggestedTitleUpdateSchema = z.object({
  index: z.number().int().min(0).max(9, 'Indice invalido'),
  title: z.string().min(1, 'Titulo e obrigatorio').max(200, 'Titulo muito longo'),
})

export const runtime = 'nodejs' // REQUIRED for firebase-admin

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * PUT /api/videos/[videoId]/suggested-titles
 *
 * Updates a single suggested title at a specific index.
 * Used when user edits a suggested title inline in Phase 5 or 5B.
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

    // Validate with Zod BEFORE persisting
    const { index, title } = SuggestedTitleUpdateSchema.parse(body)

    // Check video exists and get current suggestedTitles
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return notFoundResponse('Video')
    }

    // Get current suggestedTitles or initialize empty array
    const suggestedTitles = [...(video.suggestedTitles || [])]

    // Validate index is within bounds
    if (index >= suggestedTitles.length) {
      return NextResponse.json(
        { error: { message: 'Indice fora dos limites do array' } },
        { status: 400 }
      )
    }

    // Update the title at the specified index
    suggestedTitles[index] = title

    // Persist to Firestore
    await updateVideoAdmin(PODCAST_ID, videoId, { suggestedTitles })

    log('INFO', 'Suggested title updated', {
      videoId,
      index,
      titleLength: title.length,
    })

    return NextResponse.json({
      data: {
        videoId,
        index,
        title,
        suggestedTitles,
      },
    })
  } catch (error) {
    return handleVideoFieldError(error, 'titulo sugerido', videoId)
  }
}
