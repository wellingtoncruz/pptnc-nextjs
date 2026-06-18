/**
 * API route for generating newsletter draft via LLM.
 *
 * POST: Generates draft using writer persona and video transcription.
 *
 * Validates: auth, videoType === episode, prerequisites (title, description, transcription),
 * prompt configuration. Always attaches transcription as file.
 *
 * When regenerating (status > 'draft'), applies invalidation to clear downstream fields.
 *
 * @see epic-16-newsletter.md#Story 16.5
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import {
  authExpiredResponse,
  createErrorResponse,
  notFoundResponse,
} from '@/lib/api/video-field-handler'
import { PODCAST_ID } from '@/lib/firebase/config'
import { createJob } from '@/lib/firebase/jobs-admin'
import { getNewsletterData, saveNewsletterData } from '@/lib/firebase/newsletter-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { runJobInBackground } from '@/lib/jobs/run-job-in-background'
import { callGenAI, cleanupTranscriptionFile, createTranscriptionFile } from '@/lib/llm/client'
import { LLMError } from '@/lib/llm/errors'
import { buildNewsletterDraftSystemPrompt, buildNewsletterDraftUserPrompt } from '@/lib/llm/newsletter-prompts'
import { llmQueue } from '@/lib/llm/queue'
import { log } from '@/lib/logger'
import { NewsletterDraftLLMResponseSchema } from '@/lib/schemas'
import type { Podcast } from '@/types/podcast'

export const runtime = 'nodejs'

const RequestBodySchema = z.object({
  additionalContext: z.string().max(500).optional(),
})

interface RouteContext {
  params: Promise<{ videoId: string }>
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params
  const isAsync = new URL(request.url).searchParams.get('mode') === 'async'

  try {
    // Parse optional body
    const rawBody = await request.json().catch(() => ({}))
    const bodyResult = RequestBodySchema.safeParse(rawBody)
    const additionalContext = bodyResult.success ? bodyResult.data.additionalContext : undefined

    // Fetch video and podcast in parallel
    const [video, podcast] = await Promise.all([
      getVideoAdmin(PODCAST_ID, videoId),
      getPodcastAdmin(PODCAST_ID) as Promise<Podcast | null>,
    ])

    if (!video) {
      return notFoundResponse('Video')
    }

    if (!podcast) {
      return notFoundResponse('Podcast')
    }

    // Validate videoType === episode (newsletter is episode-only)
    if (video.videoType !== 'episode') {
      return createErrorResponse(
        'INVALID_VIDEO_TYPE',
        'Newsletter só está disponível para episódios',
        400
      )
    }

    // Validate prerequisites
    const missingFields: string[] = []
    if (!video.title) missingFields.push('título')
    if (!video.description) missingFields.push('descrição')
    if (!video.transcriptionTXT) missingFields.push('transcrição')
    if (missingFields.length > 0) {
      return createErrorResponse(
        'MISSING_PREREQUISITES',
        `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
        400
      )
    }

    // Validate prompt configuration
    const promptConfig = podcast.prompts?.episode?.newsletter?.draft
    if (!promptConfig || !promptConfig.description || !promptConfig.expectedOutput) {
      return createErrorResponse(
        'MISSING_PROMPT',
        'Prompt de newsletter draft não configurado para episódios',
        400
      )
    }

    // Build prompts
    const persona = podcast.personas?.writer
    if (!persona?.role) {
      log('WARN', 'writer persona not configured, using empty fallback', { videoId })
    }

    const systemPrompt = buildNewsletterDraftSystemPrompt(persona, promptConfig, additionalContext)
    const userPrompt = buildNewsletterDraftUserPrompt(video)

    // Build debug context only when llmDebugMode is enabled
    const debugContext = podcast?.features?.llmDebugMode
      ? { component: 'newsletter/draft', videoId, videoType: (video.videoType || 'episode') as 'episode' | 'cut' | 'reel', podcastId: PODCAST_ID }
      : undefined

    // Trabalho LLM + persistência, compartilhado entre sync e async (Epic 27).
    // Retorna o MESMO payload do caminho síncrono. Lança em falha.
    const runGeneration = async (): Promise<{
      payload: { draft: string }
      usage: { promptTokens: number; completionTokens: number; totalTokens: number }
    }> => {
      let attachmentPath: string | undefined
      try {
        attachmentPath = await createTranscriptionFile(video.transcriptionTXT!, 0)

        const { data, usage } = await llmQueue.enqueue(() =>
          callGenAI<{ draft: string }>(
            systemPrompt,
            userPrompt,
            60000,
            attachmentPath,
            debugContext,
            podcast?.llmConfig?.textModel,
            podcast?.llmConfig?.provider,
            podcast?.llmConfig?.fallbackProvider
          )
        )

        const validated = NewsletterDraftLLMResponseSchema.parse(data)

        // Invalidação downstream se regenerando a partir de status avançado
        const existingData = await getNewsletterData(videoId)
        const needsInvalidation = existingData && existingData.status !== 'idle' && existingData.status !== 'draft'

        const savePayload: { status: 'draft'; draft: string; additionalContext?: string } = {
          status: 'draft',
          draft: validated.draft,
        }
        if (additionalContext) {
          savePayload.additionalContext = additionalContext
        }

        const clearFields = needsInvalidation
          ? ['news', 'imagePrompt', 'imageUrl', 'report'] as string[]
          : undefined

        await saveNewsletterData(videoId, savePayload, clearFields)

        log('INFO', 'Newsletter draft generated via LLM', { videoId, mode: isAsync ? 'async' : 'sync' })

        return { payload: { draft: validated.draft }, usage }
      } finally {
        if (attachmentPath) {
          await cleanupTranscriptionFile(attachmentPath)
        }
      }
    }

    if (isAsync) {
      const jobId = await createJob(PODCAST_ID, { type: 'newsletter-draft', context: { videoId } })
      void runJobInBackground(PODCAST_ID, jobId, async () => {
        const { payload, usage } = await runGeneration()
        return { result: payload, usage }
      })
      return NextResponse.json({ jobId, podcastId: PODCAST_ID, status: 'pending' }, { status: 202 })
    }

    const { payload } = await runGeneration()
    return NextResponse.json({ data: payload })
  } catch (error) {
    if (error instanceof LLMError) {
      const status = error.code === 'RATE_LIMIT' ? 429 : 500
      log('WARN', 'LLM error during newsletter draft generation', {
        videoId,
        code: error.code,
        message: error.message,
      })
      return createErrorResponse(error.code, error.message, status)
    }

    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid LLM response for newsletter draft', {
        videoId,
        issues: error.issues,
      })
      return createErrorResponse('INVALID_RESPONSE', 'Resposta do LLM em formato inválido', 422)
    }

    log('ERROR', 'Failed to generate newsletter draft', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao gerar draft da newsletter', 500)
  }
}
