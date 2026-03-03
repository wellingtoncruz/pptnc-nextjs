/**
 * POST /api/news/[newsId]/generate-social
 *
 * Generates a social media post combining news + selected episode via LLM.
 *
 * Returns:
 * - Success: { data: { social: string } }
 * - 400: selected_video missing
 * - 401: Session expired
 * - 404: News or video not found
 * - 500: Internal error
 *
 * @see Story 18.4 — Redação Social LLM + Invalidação + API
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getNewsById, updateNewsFields } from '@/lib/firebase/news-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { callGenAI } from '@/lib/llm/client'
import { LLMError } from '@/lib/llm/errors'
import { buildNewsSocialSystemPrompt, buildNewsSocialUserPrompt } from '@/lib/llm/news-prompts'
import { llmQueue } from '@/lib/llm/queue'
import { log } from '@/lib/logger'
import type { Podcast } from '@/types/podcast'

const RequestBodySchema = z.object({
  additionalContext: z.string().max(500).optional(),
}).optional()

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ newsId: string }>
}

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { newsId } = await context.params

  try {
    // Parse optional additionalContext from request body
    let additionalContext: string | undefined
    const rawBody = await request.json().catch(() => undefined)
    if (rawBody !== undefined) {
      const parsed = RequestBodySchema.safeParse(rawBody)
      if (!parsed.success) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Body inválido' } },
          { status: 400 }
        )
      }
      additionalContext = parsed.data?.additionalContext
    }
    // 1. Read news document
    const news = await getNewsById(PODCAST_ID, newsId)
    if (!news) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Notícia não encontrada' } },
        { status: 404 }
      )
    }

    // 2. Validate selected_video exists
    if (!news.selected_video) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Nenhum episódio selecionado (selected_video ausente)' } },
        { status: 400 }
      )
    }

    // 3. Fetch video and podcast in parallel
    const [video, podcast] = await Promise.all([
      getVideoAdmin(PODCAST_ID, news.selected_video),
      getPodcastAdmin(PODCAST_ID) as Promise<Podcast | null>,
    ])

    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Episódio selecionado não encontrado' } },
        { status: 404 }
      )
    }

    // 4. Build prompts
    const persona = podcast?.personas?.writer
    const promptConfig = podcast?.prompts?.news?.news_social

    if (!promptConfig || !promptConfig.description || !promptConfig.expectedOutput) {
      return NextResponse.json(
        { error: { code: 'MISSING_PROMPT', message: 'Prompt news_social não configurado' } },
        { status: 400 }
      )
    }

    const systemPrompt = buildNewsSocialSystemPrompt(persona, promptConfig)
    const userPrompt = buildNewsSocialUserPrompt(
      { titulo: news.titulo, descricao: news.descricao, comentarios: news.comentarios },
      { title: video.title, description: video.description || '' },
      additionalContext
    )

    // 5. Call LLM via queue
    const { data } = await llmQueue.enqueue(() =>
      callGenAI<{ social: string }>(systemPrompt, userPrompt, 30000, undefined, undefined, podcast?.llmConfig?.textModel)
    )

    // 6. Persist social text
    await updateNewsFields(PODCAST_ID, newsId, { social: data.social })

    log('INFO', 'News social post generated via LLM', { newsId, hasAdditionalContext: !!additionalContext })

    return NextResponse.json({
      data: { social: data.social },
    })
  } catch (error) {
    if (error instanceof LLMError) {
      const status = error.code === 'RATE_LIMIT' ? 429 : 500
      log('WARN', 'LLM error during news social generation', {
        newsId,
        code: error.code,
        message: error.message,
      })
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to generate social post for news', {
      podcastId: PODCAST_ID,
      newsId,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao gerar redação social' } },
      { status: 500 }
    )
  }
}
