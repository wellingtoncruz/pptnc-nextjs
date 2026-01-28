/**
 * API route for wizard phase processing.
 *
 * POST: Process a specific phase for a video using LLM.
 *
 * This route is generic and handles phases 1-7 (phase 8 is YouTube API only).
 * Each phase returns different structured data based on its type:
 * - Phase 1: Critique (Phase1Response)
 * - Phase 2: Edit Check (Phase2Response)
 * - Phase 3: Compliance (Phase3Response)
 * - Phase 4: Chapters (Phase4Response)
 * - Phase 5: Titles (Phase5Response)
 * - Phase 6: Description (Phase6Response)
 * - Phase 7: Tags (Phase7Response)
 *
 * @see lib/llm/types.ts for response schemas
 * @see architecture-iara.md#LLM Integration
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import type { Phase1Response } from '@/lib/llm'
import { callLLM, type PhaseResponse } from '@/lib/llm'
import { WizardPhaseSchema } from '@/lib/wizard'
import { log } from '@/lib/logger'

export const runtime = 'nodejs' // REQUIRED for firebase-admin and Vertex AI

/**
 * Schema for validating phase processing request body.
 */
const PhaseRequestSchema = z.object({
  videoId: z.string().min(1, 'videoId é obrigatório'),
  // Optional prompt override for reprocessable phases
  promptOverride: z.string().optional(),
  // Optional additional context for reprocessable phases
  additionalContext: z.string().optional(),
  // Optional previous phase data for SEO chain (phases 5-7)
  previousPhaseData: z.record(z.string(), z.unknown()).optional(),
})

interface RouteContext {
  params: Promise<{ phase: string }>
}

/**
 * POST /api/wizard/phase/[phase]
 *
 * Processes a specific wizard phase for a video using LLM.
 *
 * Request body:
 * - videoId: The video to process
 * - promptOverride: Optional custom prompt (for reprocessable phases)
 * - additionalContext: Optional additional context
 * - previousPhaseData: Optional data from previous phases (for SEO chain)
 *
 * Response:
 * - data: Phase-specific response (Phase1Response, Phase2Response, etc.)
 * - usage: Token usage information
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { phase: phaseParam } = await context.params

  // Validate phase number
  const phaseNumber = parseInt(phaseParam, 10)
  const phaseResult = WizardPhaseSchema.safeParse(phaseNumber)

  if (!phaseResult.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Fase inválida. Use 1-7.' } },
      { status: 400 }
    )
  }

  const phase = phaseResult.data

  // Phase 8 has no LLM processing
  if (phase === 8) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Fase 8 não usa LLM. Use a API do YouTube.' } },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()

    // Validate request body
    const requestData = PhaseRequestSchema.parse(body)
    const { videoId, promptOverride, additionalContext, previousPhaseData } = requestData

    // Get video from Firestore
    const video = await getVideoAdmin(PODCAST_ID, videoId)

    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
        { status: 404 }
      )
    }

    log('INFO', 'Processing wizard phase', {
      videoId,
      phase,
      hasPromptOverride: !!promptOverride,
      hasAdditionalContext: !!additionalContext,
      hasPreviousPhaseData: !!previousPhaseData,
    })

    // Call LLM for this phase
    const result = await callLLM(phase, video, undefined, {
      promptOverride,
      additionalContext,
      previousPhaseData,
    })

    if (!result.success) {
      log('WARN', 'LLM call failed', {
        videoId,
        phase,
        errorCode: result.error.code,
        errorMessage: result.error.message,
      })

      return NextResponse.json(
        {
          error: {
            code: result.error.code,
            message: result.error.message,
            retryable: result.error.retryable,
          },
        },
        { status: result.error.code === 'RATE_LIMIT' ? 429 : 500 }
      )
    }

    log('INFO', 'Wizard phase processed successfully', {
      videoId,
      phase,
      tokensUsed: result.usage.totalTokens,
    })

    // Persist critique for Phase 1 (immutable, one-time only)
    if (phase === 1) {
      const phase1Data = result.data as Phase1Response
      await updateVideoAdmin(PODCAST_ID, videoId, {
        critique: phase1Data.critique,
      })
      log('INFO', 'Phase 1 critique persisted to video', { videoId })
    }

    return NextResponse.json({
      data: result.data as PhaseResponse,
      usage: result.usage,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid request data', { phaseParam, error: error.issues })
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Dados de requisição inválidos' } },
        { status: 400 }
      )
    }

    log('ERROR', 'Failed to process wizard phase', { phaseParam, error })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao processar fase' } },
      { status: 500 }
    )
  }
}
