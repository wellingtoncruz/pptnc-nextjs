/**
 * API route for generating AdWords optimization guide via LLM.
 *
 * POST: Generates guide + keywords using adwords persona and video transcription.
 *
 * Validates: auth, videoType === episode, prerequisites (title, description, transcription),
 * prompt configuration. Always attaches transcription as file (unlike social which skips for episodes).
 *
 * @see epic-15-trafego-pago.md#Story 15.5
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
import { saveAdwordsData } from '@/lib/firebase/adwords-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { callGenAI, cleanupTranscriptionFile, createTranscriptionFile } from '@/lib/llm/client'
import { LLMError } from '@/lib/llm/errors'
import { llmQueue } from '@/lib/llm/queue'
import { buildAdwordsSystemPrompt, buildAdwordsUserPrompt } from '@/lib/llm/adwords-prompts'
import { log } from '@/lib/logger'
import { AdwordsLLMResponseSchema } from '@/lib/schemas'
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

    // Validate videoType === episode (AdWords is episode-only)
    if (video.videoType !== 'episode') {
      return createErrorResponse(
        'INVALID_VIDEO_TYPE',
        'AdWords só está disponível para episódios',
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
    const promptConfig = podcast.prompts?.episode?.adwords
    if (!promptConfig || !promptConfig.description || !promptConfig.expectedOutput) {
      return createErrorResponse(
        'MISSING_PROMPT',
        'Prompt AdWords não configurado para episódios',
        400
      )
    }

    // Build prompts
    const persona = podcast.personas?.adwords
    if (!persona?.role) {
      log('WARN', 'adwords persona not configured, using empty fallback', { videoId })
    }

    const systemPrompt = buildAdwordsSystemPrompt(persona, promptConfig, additionalContext)
    const userPrompt = buildAdwordsUserPrompt(video)

    // Build debug context only when llmDebugMode is enabled (zero overhead when disabled)
    const debugContext = podcast?.features?.llmDebugMode
      ? { component: 'adwords/generate', videoId, videoType: (video.videoType || 'episode') as 'episode' | 'cut' | 'reel', podcastId: PODCAST_ID }
      : undefined

    // Create transcription file and call LLM — always attach for episodes
    let attachmentPath: string | undefined
    try {
      attachmentPath = await createTranscriptionFile(video.transcriptionTXT!, 0)

      // Call LLM via queue for sequential processing
      const { data } = await llmQueue.enqueue(() =>
        callGenAI<{ guide: string; keywords: string[] }>(
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

      // Validate LLM response with Zod (consistent with social-posts pattern)
      const validated = AdwordsLLMResponseSchema.parse(data)

      // Persist via saveAdwordsData (from Story 15.4)
      const savePayload: { guide: string; keywords: string[]; additionalContext?: string } = {
        guide: validated.guide,
        keywords: validated.keywords,
      }
      if (additionalContext) {
        savePayload.additionalContext = additionalContext
      }
      await saveAdwordsData(videoId, savePayload)

      log('INFO', 'AdWords guide generated via LLM', { videoId })

      return NextResponse.json({
        data: {
          guide: validated.guide,
          keywords: validated.keywords,
          generatedAt: new Date().toISOString(),
        },
      })
    } finally {
      if (attachmentPath) {
        await cleanupTranscriptionFile(attachmentPath)
      }
    }
  } catch (error) {
    if (error instanceof LLMError) {
      const status = error.code === 'RATE_LIMIT' ? 429 : 500
      log('WARN', 'LLM error during adwords generation', {
        videoId,
        code: error.code,
        message: error.message,
      })
      return createErrorResponse(error.code, error.message, status)
    }

    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid LLM response for adwords', {
        videoId,
        issues: error.issues,
      })
      return createErrorResponse('INVALID_RESPONSE', 'Resposta do LLM em formato inválido', 500)
    }

    log('ERROR', 'Failed to generate adwords guide', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao gerar guia AdWords', 500)
  }
}
