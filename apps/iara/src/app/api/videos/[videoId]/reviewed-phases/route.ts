/**
 * API route for marking phases as reviewed.
 *
 * POST: Add a phase to the reviewedPhases array.
 *
 * Phases 2 (Edit Check), 3 (Compliance), and 4 (Chapters) require explicit
 * confirmation from the producer before being considered complete. This API
 * persists that confirmation so it's remembered across sessions.
 *
 * @see Story 5.3 - Smart Loading de Fases Imutaveis
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { FieldValue } from 'firebase-admin/firestore'

import { auth } from '@/lib/auth'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { getAdminDb } from '@/lib/firebase/admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { log } from '@/lib/logger'
import {
  authExpiredResponse,
  notFoundResponse,
  handleVideoFieldError,
} from '@/lib/api/video-field-handler'

/**
 * Schema for validating reviewed phase request body.
 * edit-check, risk and chapters require review confirmation; the Links phase
 * (Epic 26) also uses this mechanism — zero links is a valid reviewed state,
 * so completion comes from confirmation, not from data presence.
 *
 * Imagens Extras (Epic 28) entra pelo mesmo motivo: a fase não exige nenhuma
 * das três imagens, então "passei por ela" não pode ser inferido da presença
 * de dados — sem a confirmação, o breadcrumb nunca liberaria o retorno.
 */
const ReviewedPhaseSchema = z.object({
  phase: z.union(
    [
      z.literal('edit-check'),
      z.literal('risk'),
      z.literal('chapters'),
      z.literal('links'),
      z.literal('extra-images'),
    ],
    {
      message: "Fase deve ser 'edit-check', 'risk', 'chapters', 'links' ou 'extra-images'",
    }
  ),
})

export const runtime = 'nodejs' // REQUIRED for firebase-admin

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * POST /api/videos/[videoId]/reviewed-phases
 *
 * Adds a phase to the reviewedPhases array using Firestore arrayUnion.
 * Used when user confirms they have reviewed the edit check or compliance results.
 */
export async function POST(
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

    // Validate phase with Zod
    const { phase } = ReviewedPhaseSchema.parse(body)

    // Check video exists
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return notFoundResponse('Video')
    }

    // Check if already reviewed (idempotent - don't error, just skip)
    if (video.reviewedPhases?.includes(phase)) {
      log('INFO', 'Phase already marked as reviewed', { videoId, phase })
      return NextResponse.json({
        data: {
          videoId,
          phase,
          alreadyReviewed: true,
        },
      })
    }

    // Use arrayUnion to add phase to array (creates array if doesn't exist)
    const db = getAdminDb()
    const docRef = db.collection('podcasts').doc(PODCAST_ID).collection('videos').doc(videoId)

    await docRef.update({
      reviewedPhases: FieldValue.arrayUnion(phase),
      updatedAt: FieldValue.serverTimestamp(),
    })

    log('INFO', 'Phase marked as reviewed', {
      videoId,
      phase,
    })

    return NextResponse.json({
      data: {
        videoId,
        phase,
        alreadyReviewed: false,
      },
    })
  } catch (error) {
    return handleVideoFieldError(error, 'fase revisada', videoId)
  }
}

/**
 * DELETE /api/videos/[videoId]/reviewed-phases
 *
 * Removes a phase from the reviewedPhases array using Firestore arrayRemove.
 * Used when an immutable analysis phase (edit-check/risk/chapters) is
 * reprocessed (Epic 26) — the freshly generated result must be re-reviewed.
 * Idempotent: removing an absent phase is a no-op.
 */
export async function DELETE(
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
    const { phase } = ReviewedPhaseSchema.parse(body)

    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return notFoundResponse('Video')
    }

    const db = getAdminDb()
    const docRef = db.collection('podcasts').doc(PODCAST_ID).collection('videos').doc(videoId)

    await docRef.update({
      reviewedPhases: FieldValue.arrayRemove(phase),
      updatedAt: FieldValue.serverTimestamp(),
    })

    log('INFO', 'Phase review cleared (reprocess)', { videoId, phase })

    return NextResponse.json({ data: { videoId, phase, removed: true } })
  } catch (error) {
    return handleVideoFieldError(error, 'fase revisada', videoId)
  }
}
