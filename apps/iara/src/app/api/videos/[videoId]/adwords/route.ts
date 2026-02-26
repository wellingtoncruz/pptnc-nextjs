/**
 * API route for adwords data per video.
 *
 * GET: Returns adwords data from the video document's `adwords` field.
 * POST: Saves adwords data (guide + keywords) to the video document.
 *
 * Path: podcasts/{podcastId}/videos/{videoId} → field `adwords`
 *
 * @see epic-15-trafego-pago.md#Story 15.4
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { getAdwordsData, saveAdwordsData } from '@/lib/firebase/adwords-admin'
import { log } from '@/lib/logger'
import { AdwordsDataCreateSchema } from '@/lib/schemas'
import { authExpiredResponse, createErrorResponse } from '@/lib/api/video-field-handler'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * GET /api/videos/[videoId]/adwords
 *
 * Returns adwords data for a video.
 * Response: { data: AdwordsData | null }
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
    const data = await getAdwordsData(videoId)
    return NextResponse.json({ data })
  } catch (error) {
    log('ERROR', 'Failed to get adwords data', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao carregar dados AdWords', 500)
  }
}

/**
 * POST /api/videos/[videoId]/adwords
 *
 * Saves adwords data for a video.
 * Body: { guide: string, keywords: string[], additionalContext?: string }
 * Response: { data: { generatedAt: string } }
 */
export async function POST(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return createErrorResponse('VALIDATION_ERROR', 'JSON inválido no body', 400)
    }

    const validated = AdwordsDataCreateSchema.parse(body)

    await saveAdwordsData(videoId, validated)

    return NextResponse.json({
      data: { generatedAt: new Date().toISOString() },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid adwords data', { videoId, error: error.issues })
      return createErrorResponse('VALIDATION_ERROR', 'Dados AdWords inválidos', 400)
    }

    log('ERROR', 'Failed to save adwords data', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao salvar dados AdWords', 500)
  }
}
