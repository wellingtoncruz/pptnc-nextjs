/**
 * POST /api/news/[newsId]/generate-image
 *
 * Generates an illustrative image for a news item via Gemini Image (1 direct call).
 * Returns SSE stream with progress events: generating_image → uploading → saving → complete.
 *
 * Validation errors (before generation) return normal JSON responses.
 * Generation errors are emitted as SSE `error` events.
 *
 * @see Story 18.9 — Notícias Imagem — API Route SSE + Prompt Builder
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
import {
  deleteNewsImage,
  uploadNewsImage,
  CloudStorageError,
} from '@/lib/firebase/cloud-storage'
import { getNewsById, updateNewsImageFields } from '@/lib/firebase/news-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { LLMError } from '@/lib/llm/errors'
import { callGenAIImage } from '@/lib/llm/image-client'
import { buildNewsImagePrompt } from '@/lib/llm/news-prompts'
import { llmQueue } from '@/lib/llm/queue'
import { log } from '@/lib/logger'
import type { Podcast } from '@/types/podcast'

export const runtime = 'nodejs'

const RequestBodySchema = z.object({
  additionalContext: z.string().max(500).optional(),
})

interface RouteContext {
  params: Promise<{ newsId: string }>
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse | Response> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { newsId } = await context.params

  // === VALIDATION PHASE (returns JSON on error) ===

  let additionalContext: string | undefined
  let promptText: string
  let previousImageUrl: string | undefined

  try {
    // Parse optional body
    const rawBody = await request.json().catch(() => ({}))
    const bodyResult = RequestBodySchema.safeParse(rawBody)
    if (!bodyResult.success) {
      return createErrorResponse(
        'VALIDATION_ERROR',
        bodyResult.error.issues[0]?.message ?? 'Body inválido',
        400
      )
    }
    additionalContext = bodyResult.data.additionalContext

    // Fetch news and podcast in parallel
    const [news, podcast] = await Promise.all([
      getNewsById(PODCAST_ID, newsId),
      getPodcastAdmin(PODCAST_ID) as Promise<Podcast | null>,
    ])

    if (!news) {
      return notFoundResponse('Notícia')
    }

    if (!podcast) {
      return notFoundResponse('Podcast')
    }

    // Validate prompt configuration
    const promptConfig = podcast.prompts?.news?.news_image
    if (!promptConfig || !promptConfig.description || !promptConfig.expectedOutput) {
      return createErrorResponse(
        'MISSING_PROMPT',
        'Prompt news_image não configurado. Configure em Configurações → Prompts por Recurso → Notícias → Imagem.',
        400
      )
    }

    // Build prompt
    promptText = buildNewsImagePrompt(
      { titulo: news.titulo, descricao: news.descricao, comentarios: news.comentarios },
      promptConfig,
      additionalContext
    )

    // Remember previous image for cleanup
    previousImageUrl = news.imageUrl
  } catch (error) {
    log('ERROR', 'News image validation failed', {
      newsId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao validar dados para geração de imagem', 500)
  }

  // === GENERATION PHASE (SSE stream) ===

  const encoder = new TextEncoder()
  const startTime = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // === Generate image via Gemini Image (1 direct call) ===
        send('progress', { step: 'generating_image' })

        const { imageBuffer } = await llmQueue.enqueue(() =>
          callGenAIImage(promptText)
        )

        // === Upload to Cloud Storage ===
        send('progress', { step: 'uploading' })

        const imagePath = await uploadNewsImage(newsId, imageBuffer)

        // === Save to Firestore ===
        send('progress', { step: 'saving' })

        await updateNewsImageFields(PODCAST_ID, newsId, {
          imageUrl: imagePath,
          imagePrompt: promptText,
        })

        // Cleanup previous image AFTER save succeeds (fire-and-forget)
        if (previousImageUrl) {
          deleteNewsImage(previousImageUrl).catch((err) => {
            log('WARN', 'Failed to delete previous news image', {
              newsId,
              filePath: previousImageUrl,
              error: err instanceof Error ? err.message : 'Unknown error',
            })
          })
        }

        const duration = Date.now() - startTime

        log('INFO', 'News image generated and saved', {
          newsId,
          imagePath,
          hasAdditionalContext: !!additionalContext,
          duration,
        })

        send('complete', { imagePath })
      } catch (error) {
        const errorCode =
          error instanceof LLMError ? error.code
          : error instanceof CloudStorageError ? 'STORAGE_ERROR'
          : 'INTERNAL_ERROR'

        const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar imagem da notícia'

        log('ERROR', 'News image generation failed', {
          newsId,
          code: errorCode,
          message: errorMessage,
        })

        send('error', {
          code: errorCode,
          message: errorMessage,
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
