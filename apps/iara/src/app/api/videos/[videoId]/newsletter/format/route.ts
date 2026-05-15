/**
 * API route for generating the final formatted newsletter report (Fase 4).
 *
 * POST: Generates the report by passing draft + news + imageUrl to the LLM.
 *   - No attachment (unlike Fase 1 which sends transcription).
 *   - Saves report in Firestore, status → completed.
 *   - Regeneration: keeps status as completed, replaces report.
 *
 * @see epic-16-newsletter.md#Story 16.9
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
import { getNewsletterData, saveNewsletterData } from '@/lib/firebase/newsletter-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { callGenAI } from '@/lib/llm/client'
import { LLMError } from '@/lib/llm/errors'
import { llmQueue } from '@/lib/llm/queue'
import {
  buildNewsletterFormatSystemPrompt,
  buildNewsletterFormatUserPrompt,
} from '@/lib/llm/newsletter-prompts'
import { resolveVideoPlaceholders } from '@/lib/youtube/format-chapters'
import { log } from '@/lib/logger'
import { NewsletterFormatLLMResponseSchema } from '@/lib/schemas'
import type { Podcast } from '@/types/podcast'

export const runtime = 'nodejs'

const RequestBodySchema = z.object({
  formatPrompt: z.string().min(1).max(5000),
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
    // Parse body
    const rawBody = await request.json().catch(() => ({}))
    const bodyResult = RequestBodySchema.safeParse(rawBody)
    if (!bodyResult.success) {
      return createErrorResponse(
        'INVALID_BODY',
        'Campo formatPrompt é obrigatório',
        400
      )
    }
    const { formatPrompt } = bodyResult.data

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

    // Validate videoType === episode
    if (video.videoType !== 'episode') {
      return createErrorResponse(
        'INVALID_VIDEO_TYPE',
        'Newsletter só está disponível para episódios',
        400
      )
    }

    // Fetch newsletter data and validate prerequisites
    const newsletterData = await getNewsletterData(videoId)
    if (!newsletterData) {
      return createErrorResponse(
        'MISSING_NEWSLETTER',
        'Dados da newsletter não encontrados',
        400
      )
    }

    if (newsletterData.status !== 'image_ready' && newsletterData.status !== 'completed') {
      return createErrorResponse(
        'INVALID_STATUS',
        'Newsletter precisa ter imagem gerada (Fase 3) antes de gerar o relatório',
        400
      )
    }

    if (!newsletterData.draft) {
      return createErrorResponse(
        'MISSING_DRAFT',
        'Draft da newsletter não encontrado',
        400
      )
    }

    if (!newsletterData.imageUrl) {
      return createErrorResponse(
        'MISSING_IMAGE',
        'Imagem da newsletter não encontrada. Gere a imagem na Fase 3 primeiro.',
        400
      )
    }

    // Get persona
    const persona = podcast.personas?.writer
    if (!persona?.role) {
      log('WARN', 'writer persona not configured, using empty fallback', { videoId })
    }

    // Build debug context only when llmDebugMode is enabled
    const debugContext = podcast?.features?.llmDebugMode
      ? { component: 'newsletter/format', videoId, videoType: (video.videoType || 'episode') as 'episode' | 'cut' | 'reel', podcastId: PODCAST_ID }
      : undefined

    // Build prompts — pass proxy URL (not GCS path) so the report markdown has a valid image link
    const imageProxyUrl = `/api/videos/${videoId}/newsletter/image`
    const resolvedFormatPrompt = resolveVideoPlaceholders(formatPrompt, video)
    const systemPrompt = buildNewsletterFormatSystemPrompt(persona, resolvedFormatPrompt)
    const userPrompt = buildNewsletterFormatUserPrompt(
      newsletterData.draft,
      newsletterData.news,
      imageProxyUrl
    )

    // Call LLM via queue (no attachment)
    const { data } = await llmQueue.enqueue(() =>
      callGenAI<{ report: string }>(systemPrompt, userPrompt, 60000, undefined, debugContext, podcast?.llmConfig?.textModel, podcast?.llmConfig?.provider, podcast?.llmConfig?.fallbackProvider)
    )

    // Validate LLM response
    const validated = NewsletterFormatLLMResponseSchema.parse(data)

    // Save to Firestore — preserve all existing data, add report, set completed
    await saveNewsletterData(videoId, {
      ...newsletterData,
      status: 'completed',
      report: validated.report,
    })

    log('INFO', 'Newsletter report generated via LLM', { videoId })

    return NextResponse.json({
      data: { report: validated.report },
    })
  } catch (error) {
    if (error instanceof LLMError) {
      const status = error.code === 'RATE_LIMIT' ? 429 : 500
      log('WARN', 'LLM error during newsletter format generation', {
        videoId,
        code: error.code,
        message: error.message,
      })
      return createErrorResponse(error.code, error.message, status)
    }

    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid LLM response for newsletter format', {
        videoId,
        issues: error.issues,
      })
      return createErrorResponse('INVALID_RESPONSE', 'Resposta do LLM em formato inválido', 422)
    }

    log('ERROR', 'Failed to generate newsletter report', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao gerar relatório da newsletter', 500)
  }
}
