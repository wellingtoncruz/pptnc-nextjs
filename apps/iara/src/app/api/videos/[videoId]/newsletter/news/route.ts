/**
 * API routes for newsletter news selection.
 *
 * POST: Fetches candidate news from D-2, optionally filtered by LLM.
 * PATCH: Confirms the producer's news selection (3-5 items).
 *
 * @see epic-16-newsletter.md#Story 16.6
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
import { listNewsByDate } from '@/lib/firebase/news-admin'
import { getNewsletterData, saveNewsletterData } from '@/lib/firebase/newsletter-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { callGenAI } from '@/lib/llm/client'
import { LLMError } from '@/lib/llm/errors'
import { buildNewsletterNewsSystemPrompt, buildNewsletterNewsUserPrompt } from '@/lib/llm/newsletter-prompts'
import { llmQueue } from '@/lib/llm/queue'
import { log } from '@/lib/logger'
import { InvalidNewsletterTransitionError, transition } from '@/lib/newsletter'
import { NewsletterNewsItemSchema, NewsletterNewsLLMResponseSchema } from '@/lib/schemas'
import type { News } from '@/types/news'
import type { Podcast } from '@/types/podcast'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/** Maps a PT-BR News document to an EN NewsletterNewsItem. */
function mapNewsToNewsletterItem(news: News) {
  return {
    id: news.id,
    title: news.titulo,
    description: news.descricao,
    source: news.fonte.nome,
    url: news.fonte.url,
    publishedAt: news.data,
  }
}

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params

  try {
    const video = await getVideoAdmin(PODCAST_ID, videoId)

    if (!video) {
      return notFoundResponse('Video')
    }

    if (video.videoType !== 'episode') {
      return createErrorResponse(
        'INVALID_VIDEO_TYPE',
        'Seleção de notícias só está disponível para episódios',
        400
      )
    }

    // Fetch news from the last 48 hours (D-2 range from current time)
    const now = new Date()
    const rangeStart = new Date(now.getTime() - 48 * 60 * 60 * 1000)

    log('INFO', 'Newsletter news 48h range', {
      videoId,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: now.toISOString(),
    })

    const allNews = await listNewsByDate(PODCAST_ID, rangeStart, now)

    // Map to EN format
    let candidates = allNews.map(mapNewsToNewsletterItem)
    const totalFound = candidates.length
    let llmFiltered = false

    // If >= 10, use LLM to select the most relevant
    if (totalFound >= 10) {
      const [podcast, newsletterData] = await Promise.all([
        getPodcastAdmin(PODCAST_ID) as Promise<Podcast | null>,
        getNewsletterData(videoId),
      ])

      const promptConfig = podcast?.prompts?.episode?.newsletter?.news
      const persona = podcast?.personas?.writer
      const draft = newsletterData?.draft ?? ''

      if (!promptConfig?.description || !promptConfig?.expectedOutput) {
        log('ERROR', 'Newsletter news prompt config missing', {
          videoId,
          totalFound,
          hasDescription: !!promptConfig?.description,
          hasExpectedOutput: !!promptConfig?.expectedOutput,
        })
        return createErrorResponse(
          'CONFIG_MISSING',
          'Configuração de prompt para seleção de notícias não encontrada. Configure prompts.episode.newsletter.news no painel de settings.',
          422
        )
      }

      const systemPrompt = buildNewsletterNewsSystemPrompt(persona, promptConfig)
      const userPrompt = buildNewsletterNewsUserPrompt(
        draft,
        allNews.map((n) => ({ id: n.id, titulo: n.titulo, descricao: n.descricao }))
      )

      // Build debug context only when llmDebugMode is enabled
      const debugContext = podcast?.features?.llmDebugMode
        ? { component: 'newsletter/news', videoId, videoType: 'episode' as const, podcastId: PODCAST_ID }
        : undefined

      const { data } = await llmQueue.enqueue(() =>
        callGenAI<{ selectedIds: string[] }>(
          systemPrompt,
          userPrompt,
          60000,
          undefined,
          debugContext,
          podcast?.llmConfig?.textModel
        )
      )

      const validated = NewsletterNewsLLMResponseSchema.parse(data)

      // Filter candidates preserving LLM order
      const filteredCandidates = validated.selectedIds
        .map((id) => candidates.find((c) => c.id === id))
        .filter(Boolean) as typeof candidates

      // Fallback: if LLM returned no valid IDs (hallucinated), use unfiltered list
      if (filteredCandidates.length === 0) {
        log('WARN', 'LLM returned no valid news IDs, falling back to unfiltered', {
          videoId,
          selectedIds: validated.selectedIds,
          totalCandidates: candidates.length,
        })
        llmFiltered = false
      } else {
        candidates = filteredCandidates
        llmFiltered = true
      }
    }

    log('INFO', 'Newsletter news candidates fetched', {
      videoId,
      totalFound,
      returned: candidates.length,
      llmFiltered,
    })

    return NextResponse.json({
      data: { items: candidates, totalFound, llmFiltered },
    })
  } catch (error) {
    if (error instanceof LLMError) {
      const status = error.code === 'RATE_LIMIT' ? 429 : 500
      log('WARN', 'LLM error during newsletter news selection', {
        videoId,
        code: error.code,
        message: error.message,
      })
      return createErrorResponse(error.code, error.message, status)
    }

    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid LLM response for newsletter news', {
        videoId,
        issues: error.issues,
      })
      return createErrorResponse('INVALID_RESPONSE', 'Resposta do LLM em formato inválido', 422)
    }

    log('ERROR', 'Failed to fetch newsletter news candidates', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao buscar notícias para a newsletter', 500)
  }
}

/** Validation schema for PATCH body. */
const PatchBodySchema = z.object({
  news: z.array(NewsletterNewsItemSchema).min(3).max(5),
})

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params

  try {
    const body = await request.json().catch(() => ({}))
    const bodyResult = PatchBodySchema.safeParse(body)

    if (!bodyResult.success) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        'Selecione entre 3 e 5 notícias',
        400
      )
    }

    // Fetch existing newsletter data
    const existingData = await getNewsletterData(videoId)
    if (!existingData) {
      return notFoundResponse('Newsletter')
    }

    // Validate state transition: draft → news_selected
    const newStatus = transition(existingData.status, 'selectNews')

    // Save with updated news and status
    await saveNewsletterData(videoId, {
      ...existingData,
      status: newStatus,
      news: bodyResult.data.news,
    })

    log('INFO', 'Newsletter news selection confirmed', {
      videoId,
      count: bodyResult.data.news.length,
    })

    return NextResponse.json({
      data: { status: newStatus },
    })
  } catch (error) {
    if (error instanceof InvalidNewsletterTransitionError) {
      log('WARN', 'Invalid newsletter transition for news selection', {
        videoId,
        currentStatus: error.currentStatus,
        action: error.action,
      })
      return createErrorResponse('INVALID_TRANSITION', error.message, 409)
    }

    log('ERROR', 'Failed to confirm newsletter news selection', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao confirmar seleção de notícias', 500)
  }
}
