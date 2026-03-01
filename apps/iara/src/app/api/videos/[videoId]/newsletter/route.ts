/**
 * API routes for reading and updating newsletter data.
 *
 * GET: Returns existing newsletter data for a video.
 * PATCH: Partially updates newsletter fields (e.g., draft edits via auto-save).
 *
 * @see epic-16-newsletter.md#Story 16.5
 */

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import {
  authExpiredResponse,
  createErrorResponse,
  notFoundResponse,
} from '@/lib/api/video-field-handler'
import { getNewsletterData, patchNewsletterFields } from '@/lib/firebase/newsletter-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ videoId: string }>
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params

  try {
    const data = await getNewsletterData(videoId)
    return NextResponse.json({ data: data ?? null })
  } catch (error) {
    log('ERROR', 'Failed to fetch newsletter data', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao buscar dados da newsletter', 500)
  }
}

/** Allowed fields for PATCH update. */
const PATCHABLE_FIELDS = ['draft', 'report', 'formatPrompt'] as const
const MAX_FIELD_LENGTH = 50_000

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params

  try {
    const body = await request.json().catch(() => ({}))

    // Extract only allowed fields with length validation
    const patchData: Record<string, string> = {}
    for (const field of PATCHABLE_FIELDS) {
      if (typeof body[field] === 'string') {
        const value = body[field] as string
        if (value.length > MAX_FIELD_LENGTH) {
          return createErrorResponse(
            'INVALID_BODY',
            `Campo '${field}' excede o tamanho máximo de ${MAX_FIELD_LENGTH} caracteres`,
            400
          )
        }
        patchData[field] = value
      }
    }

    if (Object.keys(patchData).length === 0) {
      return createErrorResponse(
        'INVALID_BODY',
        'Nenhum campo válido para atualização',
        400
      )
    }

    // Use dot-notation partial update (atomic, no read-modify-write race, no generatedAt reset)
    await patchNewsletterFields(videoId, patchData)

    return NextResponse.json({
      data: { updatedAt: new Date().toISOString() },
    })
  } catch (error) {
    log('ERROR', 'Failed to update newsletter data', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao atualizar dados da newsletter', 500)
  }
}
