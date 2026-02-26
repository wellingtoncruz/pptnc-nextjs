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
import { PODCAST_ID } from '@/lib/firebase/config'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import type { Phase1Response, Phase2Response, Phase3Response, Phase4Response, Phase5Response, Phase6Response, Phase7Response } from '@/lib/llm'
import { callLLMQueued, type PhaseResponse } from '@/lib/llm'
import { log } from '@/lib/logger'
import { WizardPhaseSchema } from '@/lib/wizard'

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

    // Load podcast with personas and prompts configuration (per llm.md spec)
    const podcast = await getPodcastAdmin(PODCAST_ID)

    log('INFO', 'Processing wizard phase', {
      videoId,
      phase,
      hasPromptOverride: !!promptOverride,
      hasAdditionalContext: !!additionalContext,
      hasPreviousPhaseData: !!previousPhaseData,
      hasPodcastConfig: !!(podcast?.personas && podcast?.prompts),
    })

    // Build debug context only when llmDebugMode is enabled (zero overhead when disabled)
    const debugContext = podcast?.features?.llmDebugMode
      ? { component: `wizard/phase-${phase}`, videoId, videoType: video.videoType || 'episode', podcastId: PODCAST_ID }
      : undefined

    // Call LLM for this phase with podcast configuration (using queue)
    // Per llm.md: uses podcast.personas and podcast.prompts for dynamic prompt building
    // Queue ensures sequential processing to prevent rate-limit issues
    const result = await callLLMQueued(phase, video, podcast ?? undefined, {
      promptOverride,
      additionalContext,
      previousPhaseData,
      debugContext,
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

    // Persist phase data (immutable phases 1-4)
    if (phase === 1) {
      const phase1Data = result.data as Phase1Response
      await updateVideoAdmin(PODCAST_ID, videoId, {
        critique: phase1Data.critique,
      })
      log('INFO', 'Phase 1 critique persisted to video', { videoId })
    }

    if (phase === 2) {
      const phase2Data = result.data as Phase2Response
      await updateVideoAdmin(PODCAST_ID, videoId, {
        editingIssues: phase2Data.issues,
      })
      log('INFO', 'Phase 2 editing issues persisted to video', {
        videoId,
        hasIssues: phase2Data.hasIssues,
        issueCount: phase2Data.issues.length,
      })
    }

    if (phase === 3) {
      const phase3Data = result.data as Phase3Response
      await updateVideoAdmin(PODCAST_ID, videoId, {
        riskAndCompliance: phase3Data.risks,
      })
      log('INFO', 'Phase 3 compliance risks persisted to video', {
        videoId,
        hasRisks: phase3Data.hasRisks,
        riskCount: phase3Data.risks.length,
      })
    }

    if (phase === 4) {
      const phase4Data = result.data as Phase4Response
      let normalizedChapters = phase4Data.chapters

      // YouTube requires the first chapter to start at 00:00:00
      // Normalize the first chapter timestamp to ensure compliance
      if (normalizedChapters.length > 0) {
        const firstChapter = normalizedChapters[0]
        if (firstChapter.timestamp !== '00:00:00' && firstChapter.timestamp !== '00:00') {
          log('INFO', 'Normalizing first chapter timestamp to 00:00:00', {
            videoId,
            originalTimestamp: firstChapter.timestamp,
          })
          normalizedChapters = [
            { ...firstChapter, timestamp: '00:00:00' },
            ...normalizedChapters.slice(1),
          ]
        }
      }

      // Update result data with normalized chapters
      phase4Data.chapters = normalizedChapters

      await updateVideoAdmin(PODCAST_ID, videoId, {
        chapters: normalizedChapters,
      })
      log('INFO', 'Phase 4 chapters persisted to video', {
        videoId,
        chapterCount: normalizedChapters.length,
      })
    }

    if (phase === 5) {
      const phase5Data = result.data as Phase5Response
      await updateVideoAdmin(PODCAST_ID, videoId, {
        suggestedTitles: phase5Data.titles,
      })
      log('INFO', 'Phase 5 suggested titles persisted to video', {
        videoId,
        titleCount: phase5Data.titles.length,
      })
    }

    // Persist description for Phase 6
    if (phase === 6) {
      const phase6Data = result.data as Phase6Response
      await updateVideoAdmin(PODCAST_ID, videoId, {
        description: phase6Data.description,
      })
      log('INFO', 'Phase 6 description persisted to video', {
        videoId,
        descriptionLength: phase6Data.description.length,
      })
    }

    // For Phase 7, normalize tags to respect YouTube limits
    // Max 30 tags, max 500 characters total
    if (phase === 7) {
      const phase7Data = result.data as Phase7Response
      let normalizedTags = phase7Data.tags

      // Limit to 30 tags
      if (normalizedTags.length > 30) {
        log('WARN', 'LLM generated too many tags, truncating', {
          videoId,
          originalCount: normalizedTags.length,
        })
        normalizedTags = normalizedTags.slice(0, 30)
      }

      // Ensure total characters don't exceed 500
      let totalChars = normalizedTags.join(',').length
      while (totalChars > 500 && normalizedTags.length > 1) {
        normalizedTags.pop()
        totalChars = normalizedTags.join(',').length
      }

      // Update result data with normalized tags
      phase7Data.tags = normalizedTags

      // Persist normalized tags to Firestore
      await updateVideoAdmin(PODCAST_ID, videoId, {
        tags: normalizedTags,
      })

      log('INFO', 'Phase 7 tags normalized and persisted', {
        videoId,
        tagCount: normalizedTags.length,
        totalChars,
      })
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
