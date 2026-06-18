/**
 * API routes for newsletter cover image.
 *
 * GET: Proxy — serves the stored image from Cloud Storage via ADC.
 *      The bucket is NOT public; images are accessed server-side with ADC
 *      and streamed to the authenticated client.
 *
 * POST: Generates a new image via two sequential LLM calls:
 *   1. Text LLM (callGenAI) — generates a descriptive image prompt
 *   2. Image LLM (callGenAIImage) — generates the actual image from that prompt
 *   Then uploads to Cloud Storage and saves file path + prompt in Firestore.
 *
 * When regenerating (status >= image_ready), deletes previous image (fire-and-forget)
 * and applies invalidation to clear downstream fields (report).
 *
 * @see epic-16-newsletter.md#Story 16.8
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
  deleteNewsletterImage,
  downloadNewsletterImage,
  uploadNewsletterImage,
  CloudStorageError,
} from '@/lib/firebase/cloud-storage'
import { getNewsletterData, saveNewsletterData } from '@/lib/firebase/newsletter-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { callGenAI } from '@/lib/llm/client'
import { LLMError } from '@/lib/llm/errors'
import { callGenAIImage } from '@/lib/llm/image-client'
import {
  buildNewsletterImageSystemPrompt,
  buildNewsletterImageUserPrompt,
} from '@/lib/llm/newsletter-prompts'
import { llmQueue } from '@/lib/llm/queue'
import { log } from '@/lib/logger'
import { NewsletterImageLLMResponseSchema } from '@/lib/schemas'
import type { Persona, Podcast, PromptField } from '@/types/podcast'

export const runtime = 'nodejs'

const RequestBodySchema = z.object({
  additionalContext: z.string().max(500).optional(),
  editedPrompt: z.string().min(1).max(2000).optional(),
})

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * GET — Proxy: serves the newsletter image from Cloud Storage via ADC.
 *
 * The bucket is private. The server downloads the image using ADC
 * and returns it as an image/png response with cache headers.
 */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse | Response> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params

  try {
    const newsletterData = await getNewsletterData(videoId)
    if (!newsletterData?.imageUrl) {
      return notFoundResponse('Newsletter image')
    }

    const imageBuffer = await downloadNewsletterImage(newsletterData.imageUrl)

    // Detect image format from magic bytes
    const bytes = new Uint8Array(imageBuffer instanceof Buffer ? imageBuffer : imageBuffer.slice(0, 4))
    let contentType = 'image/png'
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) contentType = 'image/jpeg'
    else if (bytes[0] === 0x52 && bytes[1] === 0x49) contentType = 'image/webp'

    return new Response(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    if (error instanceof CloudStorageError) {
      log('ERROR', 'Failed to proxy newsletter image', {
        videoId,
        code: error.code,
        message: error.message,
      })
      return createErrorResponse('STORAGE_ERROR', 'Imagem não encontrada no storage', 404)
    }

    log('ERROR', 'Failed to proxy newsletter image', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao carregar imagem da newsletter', 500)
  }
}

/**
 * POST — Generate a new newsletter cover image via Gemini.
 *
 * Returns SSE stream with progress events on success.
 * Validation errors (before generation) return normal JSON responses.
 *
 * Body options:
 *   - additionalContext: extra instructions for prompt generation (Call 1)
 *   - editedPrompt: skip Call 1 and use this prompt directly for Call 2
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse | Response> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params

  // === VALIDATION PHASE (returns JSON on error) ===

  let additionalContext: string | undefined
  let editedPrompt: string | undefined
  let newsletterData: Awaited<ReturnType<typeof getNewsletterData>>
  let promptConfig: PromptField | undefined
  let persona: Persona | undefined
  let debugContextPrompt: { component: string; videoId: string; videoType: 'episode' | 'cut' | 'reel'; podcastId: string } | undefined
  let debugContextImage: typeof debugContextPrompt
  let textModelOverride: string | undefined
  let imageModelOverride: string | undefined
  let providerOverride: 'gemini' | 'claude' | undefined
  let fallbackProviderOverride: 'gemini' | undefined

  try {
    // Parse optional body
    const rawBody = await request.json().catch(() => ({}))
    const bodyResult = RequestBodySchema.safeParse(rawBody)
    additionalContext = bodyResult.success ? bodyResult.data.additionalContext : undefined
    editedPrompt = bodyResult.success ? bodyResult.data.editedPrompt : undefined

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

    // Fetch newsletter data — validate that draft exists
    newsletterData = await getNewsletterData(videoId)
    if (!newsletterData?.draft) {
      return createErrorResponse(
        'MISSING_DRAFT',
        'Draft da newsletter não encontrado. Gere o draft na Fase 1 primeiro.',
        400
      )
    }

    // Validate prompt configuration for image (only needed when editedPrompt is not provided)
    promptConfig = podcast.prompts?.episode?.newsletter?.image
    if (!editedPrompt && (!promptConfig || !promptConfig.description || !promptConfig.expectedOutput)) {
      return createErrorResponse(
        'MISSING_PROMPT',
        'Prompt de newsletter image não configurado para episódios. Configure prompts.episode.newsletter.image no painel de settings.',
        400
      )
    }

    // Get persona
    persona = podcast.personas?.writer
    if (!persona?.role) {
      log('WARN', 'writer persona not configured, using empty fallback', { videoId })
    }

    // Build debug contexts for the 2 sequential LLM calls (separate component names)
    debugContextPrompt = podcast?.features?.llmDebugMode
      ? { component: 'newsletter/image-prompt', videoId, videoType: (video.videoType || 'episode') as 'episode' | 'cut' | 'reel', podcastId: PODCAST_ID }
      : undefined
    debugContextImage = podcast?.features?.llmDebugMode
      ? { component: 'newsletter/image-generate', videoId, videoType: (video.videoType || 'episode') as 'episode' | 'cut' | 'reel', podcastId: PODCAST_ID }
      : undefined

    // Extract LLM model config for override
    textModelOverride = podcast?.llmConfig?.textModel
    imageModelOverride = podcast?.llmConfig?.imageModel
    providerOverride = podcast?.llmConfig?.provider
    fallbackProviderOverride = podcast?.llmConfig?.fallbackProvider
  } catch (error) {
    log('ERROR', 'Newsletter image validation failed', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao validar dados para geração de imagem', 500)
  }

  // === GENERATION PHASE (SSE stream) ===

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Heartbeat SSE (Epic 27 / ADR-27.3): comentário ': ping' a cada 20s
      // mantém a conexão viva sob o edge timeout (~60s) do Cloud Run durante a
      // geração de imagem (longa). Comentário é ignorado pelo cliente (SSE padrão).
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 20_000)

      let imagePromptText: string | undefined

      try {
        // === CALL 1: Generate image prompt (skip if editedPrompt provided) ===
        if (editedPrompt) {
          imagePromptText = editedPrompt
        } else {
          send('progress', { step: 'generating_prompt' })

          const systemPrompt = buildNewsletterImageSystemPrompt(persona, promptConfig!, additionalContext)
          const userPrompt = buildNewsletterImageUserPrompt(newsletterData.draft!, newsletterData.news)

          const { data: promptData } = await llmQueue.enqueue(() =>
            callGenAI<{ imagePrompt: string }>(systemPrompt, userPrompt, 60000, undefined, debugContextPrompt, textModelOverride, providerOverride, fallbackProviderOverride)
          )

          const validatedPrompt = NewsletterImageLLMResponseSchema.parse(promptData)
          imagePromptText = validatedPrompt.imagePrompt

          log('INFO', 'Newsletter image prompt generated', { videoId, promptLength: imagePromptText.length })
        }

        // === CALL 2: Generate image ===
        send('progress', { step: 'generating_image' })

        const { imageBuffer } = await llmQueue.enqueue(() =>
          callGenAIImage(imagePromptText!, debugContextImage, imageModelOverride)
        )

        // === Upload to Cloud Storage ===
        send('progress', { step: 'uploading' })

        // uploadNewsletterImage returns a GCS file path (not a URL)
        const imagePath = await uploadNewsletterImage(videoId, imageBuffer)

        // === Save to Firestore ===
        send('progress', { step: 'saving' })

        // Atomic dot-notation: clear downstream fields (report) when regenerating
        const needsInvalidation = newsletterData.status === 'image_ready' || newsletterData.status === 'completed'
        const clearFields = needsInvalidation ? ['report'] as string[] : undefined

        await saveNewsletterData(
          videoId,
          { ...newsletterData, imageUrl: imagePath, imagePrompt: imagePromptText!, status: 'image_ready' },
          clearFields
        )

        // Cleanup previous image AFTER save succeeds to avoid data inconsistency
        if (newsletterData.imageUrl) {
          deleteNewsletterImage(newsletterData.imageUrl).catch((err) => {
            log('WARN', 'Failed to delete previous newsletter image', {
              videoId,
              filePath: newsletterData.imageUrl,
              error: err instanceof Error ? err.message : 'Unknown error',
            })
          })
        }

        log('INFO', 'Newsletter image generated and saved', { videoId, imagePath })

        send('complete', { imagePath, imagePrompt: imagePromptText })
      } catch (error) {
        const errorCode =
          error instanceof LLMError ? error.code
          : error instanceof CloudStorageError ? 'STORAGE_ERROR'
          : error instanceof z.ZodError ? 'INVALID_RESPONSE'
          : 'INTERNAL_ERROR'

        const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar imagem da newsletter'

        log('ERROR', 'Newsletter image generation failed', {
          videoId,
          code: errorCode,
          message: errorMessage,
        })

        send('error', {
          code: errorCode,
          message: errorMessage,
          ...(imagePromptText ? { imagePrompt: imagePromptText } : {}),
        })
      } finally {
        clearInterval(heartbeat)
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
