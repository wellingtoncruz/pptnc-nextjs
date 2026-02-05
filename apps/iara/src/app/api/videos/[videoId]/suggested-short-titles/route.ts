/**
 * API route for video suggested short titles operations.
 *
 * PUT: Update a single suggested short title at a specific index
 *
 * suggestedShortTitles is stored as an array on the video document.
 * Used exclusively for cut videos in Phase 5B.
 *
 * @see Story 10-7 - Editable suggested short titles
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
 * Schema for validating suggested short title update request body.
 */
const SuggestedShortTitleUpdateSchema = z.object({
  index: z.number().int().min(0).max(9, 'Indice invalido'),
  shortTitle: z.string().min(1, 'Titulo curto e obrigatorio').max(100, 'Titulo curto muito longo'),
})

export const runtime = 'nodejs' // REQUIRED for firebase-admin

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * PUT /api/videos/[videoId]/suggested-short-titles
 *
 * Updates a single suggested short title at a specific index.
 * Used when user edits a suggested short title inline in Phase 5B.
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
    const { index, shortTitle } = SuggestedShortTitleUpdateSchema.parse(body)

    // Check video exists and get current suggestedShortTitles
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return notFoundResponse('Video')
    }

    // Get current suggestedShortTitles or initialize empty array
    const suggestedShortTitles = [...(video.suggestedShortTitles || [])]

    // Validate index is within bounds
    if (index >= suggestedShortTitles.length) {
      return NextResponse.json(
        { error: { message: 'Indice fora dos limites do array' } },
        { status: 400 }
      )
    }

    // Update the short title at the specified index
    suggestedShortTitles[index] = shortTitle

    // Persist to Firestore
    await updateVideoAdmin(PODCAST_ID, videoId, { suggestedShortTitles })

    log('INFO', 'Suggested short title updated', {
      videoId,
      index,
      shortTitleLength: shortTitle.length,
    })

    return NextResponse.json({
      data: {
        videoId,
        index,
        shortTitle,
        suggestedShortTitles,
      },
    })
  } catch (error) {
    return handleVideoFieldError(error, 'titulo curto sugerido', videoId)
  }
}
