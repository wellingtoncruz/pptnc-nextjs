/**
 * API route for wizard phase 5B processing.
 *
 * POST: Process phase 5B (Short Title) for cut videos using LLM.
 *
 * Phase 5B is exclusive to cut videos and generates short title suggestions
 * for YouTube thumbnails. Uses prompt podcast.prompt.cut.thumbs.
 *
 * Body: { videoId: string, additionalContext?: string }
 *
 * Supports two execution modes (selected by `?mode` query param):
 * - sync (default): waits for LLM completion, returns 200 + result
 * - async: returns 202 + jobId immediately; frontend polls
 *   GET /api/wizard/jobs/[jobId]. Required for the public domain (Cloud Run
 *   domain mapping has a ~60s edge timeout that severs the browser
 *   connection even when the LLM is still working).
 *
 * Returns (sync):
 * - Success: { data: { shortTitles: string[] }, usage: { ... } }
 * - Error: { error: { code: string, message: string } }
 *
 * Returns (async):
 * - Success: 202 { jobId, podcastId, status: 'pending' }
 * - Error: { error: { code: string, message: string } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { createWizardJob, updateWizardJob } from '@/lib/firebase/wizard-jobs-admin'
import {
  callGenAI,
  createTranscriptionFile,
  cleanupTranscriptionFile,
  LLMError,
  createLLMError,
} from '@/lib/llm'
import type { Phase5BResponse } from '@/lib/llm'
import { log } from '@/lib/logger'
import type { Podcast } from '@/types/podcast'
import type { Video } from '@/types/video'

export const runtime = 'nodejs'

/**
 * Schema for validating phase 5B request body.
 */
const Phase5BRequestSchema = z.object({
  videoId: z.string().min(1, 'videoId é obrigatório'),
  additionalContext: z.string().optional(),
})

/**
 * Base system prompt for phase 5B (Short Title for thumbnails).
 * Used as fallback when podcast.prompt.cut.thumbs is not configured.
 */
const BASE_SYSTEM_PROMPT_5B = `Você é um especialista em criação de títulos curtos e impactantes para thumbnails de YouTube.
Gere 5 sugestões de título curto para o corte de vídeo baseado no contexto e transcrição.

Regras:
- Títulos DEVEM ter entre 15-35 caracteres (ideal para thumbnails)
- Use linguagem direta e impactante
- Crie urgência ou curiosidade
- Evite palavras desnecessárias
- Considere que serão sobrepostos em imagens

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "shortTitles": [
    "Título Curto 1",
    "Título Curto 2",
    "Título Curto 3",
    "Título Curto 4",
    "Título Curto 5"
  ]
}`

/**
 * Build system prompt for phase 5B.
 * Uses podcast.prompt.cut.thumbs if configured, otherwise falls back to BASE_SYSTEM_PROMPT_5B.
 */
function buildPhase5BPrompt(
  podcast: { prompts?: { cut?: { thumbs?: { description?: string; expectedOutput?: string } } }; personas?: { writer?: { role?: string; objective?: string; resume?: string } } } | null,
  additionalContext?: string
): string {
  let systemPrompt = BASE_SYSTEM_PROMPT_5B

  // Try to use podcast.prompt.cut.thumbs if available
  if (podcast?.prompts?.cut?.thumbs?.description && podcast?.prompts?.cut?.thumbs?.expectedOutput) {
    const persona = podcast.personas?.writer
    if (persona?.role && persona?.objective) {
      systemPrompt = `Seu papel: ${persona.role}
Seu objetivo: ${persona.objective}
Seu contexto: ${persona.resume || ''}

## TAREFA
${podcast.prompts.cut.thumbs.description}

Sua resposta DEVE ser um JSON válido com a seguinte estrutura:
{
  "shortTitles": [
    "Título Curto 1",
    "Título Curto 2",
    "Título Curto 3",
    "Título Curto 4",
    "Título Curto 5"
  ]
}`
      log('INFO', 'Using configured cut.thumbs prompt for phase 5B')
    }
  } else {
    log('INFO', 'Using fallback prompt for phase 5B (no podcast.prompt.cut.thumbs configured)')
  }

  // Append additional context if provided
  if (additionalContext) {
    systemPrompt += `\n\n**INSTRUÇÃO PRIORITÁRIA DO PRODUTOR:**\nDê uma atenção especial a essa instrução: ${additionalContext}`
  }

  return systemPrompt
}

/**
 * Core LLM execution + persistence for phase 5B. Used by both the sync and
 * async paths. Caller is responsible for upstream validation (auth, video
 * type, transcription presence) before invoking this.
 */
async function executePhase5B(
  video: Video,
  podcast: Podcast | null,
  additionalContext: string | undefined
): Promise<{ data: Phase5BResponse; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const transcription = video.transcriptionTXT || video.transcriptionSRT
  if (!transcription) {
    throw new LLMError('MISSING_TRANSCRIPT', 'Vídeo não possui transcrição', false)
  }

  const systemPrompt = buildPhase5BPrompt(podcast, additionalContext)
  const userPrompt = `## Contexto do Corte

**Título do episódio original:** ${video.title || 'Sem título'}
**Título selecionado para o corte:** ${video.title || 'Não definido'}
**Duração:** ${video.duration ? `${Math.floor(video.duration / 60)}min ${video.duration % 60}s` : 'Não informada'}
**Tema:** ${video.theme || 'Não informado'}

**Convidados:**
${video.guests?.map(g => `- ${g.name} (${g.role || 'Convidado'})`).join('\n') || 'Não informado'}

[Transcrição anexada como arquivo]`

  const transcriptionFilePath = await createTranscriptionFile(transcription, 'short-title')

  const debugContext = podcast?.features?.llmDebugMode
    ? { component: 'wizard/phase-5b', videoId: video.id, videoType: video.videoType || 'cut', podcastId: PODCAST_ID }
    : undefined

  try {
    const { data, usage } = await callGenAI<Phase5BResponse>(
      systemPrompt,
      userPrompt,
      120000,
      transcriptionFilePath,
      debugContext,
      podcast?.llmConfig?.textModel,
      podcast?.llmConfig?.provider,
      podcast?.llmConfig?.fallbackProvider
    )

    if (!data || !Array.isArray(data.shortTitles)) {
      throw new LLMError('PARSE_ERROR', 'Resposta do LLM não contém shortTitles válido', false)
    }

    await updateVideoAdmin(PODCAST_ID, video.id, {
      suggestedShortTitles: data.shortTitles,
    })

    log('INFO', 'Phase 5B short titles generated successfully', {
      videoId: video.id,
      shortTitleCount: data.shortTitles.length,
      tokensUsed: usage.totalTokens,
    })

    return { data, usage }
  } finally {
    await cleanupTranscriptionFile(transcriptionFilePath)
  }
}

/**
 * Background worker for the async path. Mirrors the sync flow but writes the
 * result/error to a wizard job document instead of the HTTP response. Never
 * throws — failures are recorded on the job for the polling client to read.
 */
async function processPhase5BInBackground(params: {
  jobId: string
  video: Video
  podcast: Podcast | null
  additionalContext: string | undefined
}): Promise<void> {
  const { jobId, video, podcast, additionalContext } = params
  const videoId = video.id

  try {
    await updateWizardJob(PODCAST_ID, videoId, jobId, { status: 'processing' })

    const { data, usage } = await executePhase5B(video, podcast, additionalContext)

    await updateWizardJob(PODCAST_ID, videoId, jobId, {
      status: 'complete',
      result: data,
      usage,
    })

    log('INFO', 'Async phase 5B job completed', {
      jobId,
      videoId,
      tokensUsed: usage.totalTokens,
    })
  } catch (error) {
    const llmError = error instanceof LLMError ? error : createLLMError(error)
    log('WARN', 'Async phase 5B job failed', {
      jobId,
      videoId,
      errorCode: llmError.code,
      errorMessage: llmError.message,
    })

    try {
      await updateWizardJob(PODCAST_ID, videoId, jobId, {
        status: 'failed',
        error: {
          code: llmError.code,
          message: llmError.message,
          retryable: llmError.retryable,
        },
      })
    } catch (updateError) {
      log('ERROR', 'Failed to record phase 5B job failure', {
        jobId,
        videoId,
        updateError: updateError instanceof Error ? updateError.message : String(updateError),
      })
    }
  }
}

/**
 * POST /api/wizard/phase/5b
 *
 * Processes phase 5B (Short Title) for cut videos.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const isAsync = request.nextUrl.searchParams.get('mode') === 'async'

  try {
    const body = await request.json()
    const requestData = Phase5BRequestSchema.parse(body)
    const { videoId, additionalContext } = requestData

    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
        { status: 404 }
      )
    }

    if (video.videoType !== 'cut') {
      return NextResponse.json(
        { error: { code: 'INVALID_VIDEO_TYPE', message: 'Fase 5B é exclusiva para vídeos do tipo cut' } },
        { status: 400 }
      )
    }

    const transcription = video.transcriptionTXT || video.transcriptionSRT
    if (!transcription) {
      return NextResponse.json(
        { error: { code: 'MISSING_TRANSCRIPT', message: 'Vídeo não possui transcrição' } },
        { status: 400 }
      )
    }

    const podcast = await getPodcastAdmin(PODCAST_ID)

    log('INFO', 'Processing phase 5B short titles', {
      videoId,
      mode: isAsync ? 'async' : 'sync',
      hasAdditionalContext: !!additionalContext,
      hasPodcastConfig: !!(podcast?.prompts?.cut?.thumbs),
    })

    if (isAsync) {
      const jobId = await createWizardJob(PODCAST_ID, {
        videoId,
        phase: 'short-title',
        ...(additionalContext ? { additionalContext } : {}),
      })

      void processPhase5BInBackground({
        jobId,
        video,
        podcast: podcast ?? null,
        additionalContext,
      })

      return NextResponse.json(
        { jobId, podcastId: PODCAST_ID, status: 'pending' },
        { status: 202 }
      )
    }

    // ───── Sync path (legacy) ─────
    const { data, usage } = await executePhase5B(video, podcast ?? null, additionalContext)
    return NextResponse.json({ data, usage })
  } catch (error) {
    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid request data for phase 5B', { error: error.issues })
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Dados de requisição inválidos' } },
        { status: 400 }
      )
    }

    if (error instanceof LLMError) {
      log('WARN', 'LLM error in phase 5B', { errorCode: error.code, errorMessage: error.message })
      return NextResponse.json(
        { error: { code: error.code, message: error.message, retryable: error.retryable } },
        { status: error.code === 'RATE_LIMIT' ? 429 : 500 }
      )
    }

    const llmError = createLLMError(error)
    log('ERROR', 'Failed to process phase 5B', { error: llmError.message })
    return NextResponse.json(
      { error: { code: llmError.code, message: llmError.message } },
      { status: 500 }
    )
  }
}
