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
 * Supports two execution modes (selected by `?mode` query param):
 * - sync (default): waits for LLM completion, returns 200 + result
 * - async: returns 202 + jobId immediately; frontend listens via Firestore
 *   onSnapshot. Required for long-running phases on the public domain
 *   (Cloud Run domain mapping has a ~60s edge timeout that severs the
 *   browser connection even though the service completes successfully).
 *
 * @see lib/llm/types.ts for response schemas
 * @see lib/firebase/wizard-jobs-admin.ts for the async job model
 * @see architecture-iara.md#LLM Integration
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { createWizardJob, updateWizardJob } from '@/lib/firebase/wizard-jobs-admin'
import type { Phase1Response, Phase2Response, Phase3Response, Phase4Response, Phase5Response, Phase6Response, Phase7Response } from '@/lib/llm'
import { callLLMQueued, type PhaseResponse } from '@/lib/llm'
import type { LLMResult } from '@/lib/llm/types'
import { log } from '@/lib/logger'
import type { Podcast } from '@/types/podcast'
import type { Video } from '@/types/video'
import { isLLMPhaseId, type LLMPhaseId } from '@/lib/wizard'

export const runtime = 'nodejs' // REQUIRED for firebase-admin and Vertex AI

const PhaseRequestSchema = z.object({
  videoId: z.string().min(1, 'videoId é obrigatório'),
  promptOverride: z.string().optional(),
  additionalContext: z.string().optional(),
  previousPhaseData: z.record(z.string(), z.unknown()).optional(),
})

interface RouteContext {
  params: Promise<{ phase: string }>
}

type LLMPhase = LLMPhaseId

/**
 * Persists the phase result to the parent video document and returns the
 * (possibly normalized) result data. Phases 4 and 7 normalize before persist
 * (chapters first-timestamp, tags YouTube limits).
 */
async function persistPhaseResult(
  phase: LLMPhase,
  videoId: string,
  data: PhaseResponse
): Promise<PhaseResponse> {
  if (phase === 'critique') {
    const phase1Data = data as Phase1Response
    await updateVideoAdmin(PODCAST_ID, videoId, { critique: phase1Data.critique })
    log('INFO', 'Phase 1 critique persisted to video', { videoId })
    return phase1Data
  }

  if (phase === 'edit-check') {
    const phase2Data = data as Phase2Response
    // Epic 26 Bloco D v2 (ADR-26.8) — os issues já carregam `category`; o valor
    // reservado "link" sinaliza menção a link/descrição e alimenta o badge da
    // fase Links (fonte única, sem campo paralelo).
    await updateVideoAdmin(PODCAST_ID, videoId, {
      editingIssues: phase2Data.issues,
    })
    log('INFO', 'Phase 2 editing issues persisted to video', {
      videoId,
      hasIssues: phase2Data.hasIssues,
      issueCount: phase2Data.issues.length,
      linkMentionCount: phase2Data.issues.filter((i) => i.category === 'link').length,
    })
    return phase2Data
  }

  if (phase === 'risk') {
    const phase3Data = data as Phase3Response
    await updateVideoAdmin(PODCAST_ID, videoId, { riskAndCompliance: phase3Data.risks })
    log('INFO', 'Phase 3 compliance risks persisted to video', {
      videoId,
      hasRisks: phase3Data.hasRisks,
      riskCount: phase3Data.risks.length,
    })
    return phase3Data
  }

  if (phase === 'chapters') {
    const phase4Data = data as Phase4Response
    let normalizedChapters = phase4Data.chapters

    // YouTube requires the first chapter to start at 00:00:00
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

    phase4Data.chapters = normalizedChapters
    await updateVideoAdmin(PODCAST_ID, videoId, { chapters: normalizedChapters })
    log('INFO', 'Phase 4 chapters persisted to video', {
      videoId,
      chapterCount: normalizedChapters.length,
    })
    return phase4Data
  }

  if (phase === 'title') {
    const phase5Data = data as Phase5Response
    await updateVideoAdmin(PODCAST_ID, videoId, { suggestedTitles: phase5Data.titles })
    log('INFO', 'Phase 5 suggested titles persisted to video', {
      videoId,
      titleCount: phase5Data.titles.length,
    })
    return phase5Data
  }

  if (phase === 'description') {
    const phase6Data = data as Phase6Response
    await updateVideoAdmin(PODCAST_ID, videoId, { description: phase6Data.description })
    log('INFO', 'Phase 6 description persisted to video', {
      videoId,
      descriptionLength: phase6Data.description.length,
    })
    return phase6Data
  }

  if (phase === 'tags') {
    const phase7Data = data as Phase7Response
    let normalizedTags = phase7Data.tags

    // YouTube limits: max 30 tags, max 500 characters total
    if (normalizedTags.length > 30) {
      log('WARN', 'LLM generated too many tags, truncating', {
        videoId,
        originalCount: normalizedTags.length,
      })
      normalizedTags = normalizedTags.slice(0, 30)
    }

    let totalChars = normalizedTags.join(',').length
    while (totalChars > 500 && normalizedTags.length > 1) {
      normalizedTags.pop()
      totalChars = normalizedTags.join(',').length
    }

    phase7Data.tags = normalizedTags
    await updateVideoAdmin(PODCAST_ID, videoId, { tags: normalizedTags })
    log('INFO', 'Phase 7 tags normalized and persisted', {
      videoId,
      tagCount: normalizedTags.length,
      totalChars,
    })
    return phase7Data
  }

  return data
}

/**
 * Background worker for the async path. Runs the LLM call and persists
 * results, updating the wizard job document along the way. Never throws —
 * errors are written to the job document so the frontend can react.
 */
async function processWizardJobInBackground(params: {
  jobId: string
  phase: LLMPhase
  video: Video
  podcast: Podcast | null
  options: {
    promptOverride?: string
    additionalContext?: string
    previousPhaseData?: Record<string, unknown>
    debugContext?: { component: string; videoId: string; videoType: 'episode' | 'cut' | 'reel'; podcastId: string }
  }
}): Promise<void> {
  const { jobId, phase, video, podcast, options } = params
  const videoId = video.id

  try {
    await updateWizardJob(PODCAST_ID, videoId, jobId, { status: 'processing' })

    const result: LLMResult<PhaseResponse> = await callLLMQueued(
      phase,
      video,
      podcast ?? undefined,
      options
    )

    if (!result.success) {
      log('WARN', 'Async LLM call failed', {
        jobId,
        videoId,
        phase,
        errorCode: result.error.code,
        errorMessage: result.error.message,
      })
      await updateWizardJob(PODCAST_ID, videoId, jobId, {
        status: 'failed',
        error: {
          code: result.error.code,
          message: result.error.message,
          retryable: result.error.retryable,
        },
      })
      return
    }

    const persisted = await persistPhaseResult(phase, videoId, result.data)

    await updateWizardJob(PODCAST_ID, videoId, jobId, {
      status: 'complete',
      result: persisted,
      usage: result.usage,
    })

    log('INFO', 'Async wizard job completed', {
      jobId,
      videoId,
      phase,
      tokensUsed: result.usage.totalTokens,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido'
    log('ERROR', 'Async wizard job crashed', { jobId, videoId, phase, error: message })

    try {
      await updateWizardJob(PODCAST_ID, videoId, jobId, {
        status: 'failed',
        error: { code: 'UNKNOWN', message, retryable: false },
      })
    } catch (updateError) {
      log('ERROR', 'Failed to record job failure', {
        jobId,
        videoId,
        updateError: updateError instanceof Error ? updateError.message : String(updateError),
      })
    }
  }
}

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

  if (!isLLMPhaseId(phaseParam)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Fase inválida (esperado um ID de fase LLM kebab-case).' } },
      { status: 400 }
    )
  }

  const phase: LLMPhase = phaseParam

  const isAsync = request.nextUrl.searchParams.get('mode') === 'async'

  try {
    const body = await request.json()
    const requestData = PhaseRequestSchema.parse(body)
    const { videoId, promptOverride, additionalContext, previousPhaseData } = requestData

    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
        { status: 404 }
      )
    }

    const podcast = await getPodcastAdmin(PODCAST_ID)

    log('INFO', 'Processing wizard phase', {
      videoId,
      phase,
      mode: isAsync ? 'async' : 'sync',
      hasPromptOverride: !!promptOverride,
      hasAdditionalContext: !!additionalContext,
      hasPreviousPhaseData: !!previousPhaseData,
      hasPodcastConfig: !!(podcast?.personas && podcast?.prompts),
    })

    const debugContext = podcast?.features?.llmDebugMode
      ? { component: `wizard/phase-${phase}`, videoId, videoType: video.videoType || 'episode' as const, podcastId: PODCAST_ID }
      : undefined

    const callOptions = { promptOverride, additionalContext, previousPhaseData, debugContext }

    if (isAsync) {
      const jobId = await createWizardJob(PODCAST_ID, {
        videoId,
        phase,
        ...(additionalContext ? { additionalContext } : {}),
        ...(promptOverride ? { promptOverride } : {}),
      })

      // Fire-and-forget. Cloud Run with --no-cpu-throttling keeps the
      // instance alive while the Promise is pending, until --timeout (1800s)
      // or the worker resolves. Errors are captured inside the worker and
      // written to the job document.
      void processWizardJobInBackground({
        jobId,
        phase,
        video,
        podcast: podcast ?? null,
        options: callOptions,
      })

      return NextResponse.json(
        { jobId, podcastId: PODCAST_ID, status: 'pending' },
        { status: 202 }
      )
    }

    // ───── Sync path (legacy) ─────
    const result = await callLLMQueued(phase, video, podcast ?? undefined, callOptions)

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

    const persisted = await persistPhaseResult(phase, videoId, result.data)

    return NextResponse.json({
      data: persisted,
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
