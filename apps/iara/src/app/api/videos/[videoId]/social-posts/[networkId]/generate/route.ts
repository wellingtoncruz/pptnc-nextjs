import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { authExpiredResponse, createErrorResponse, notFoundResponse } from '@/lib/api/video-field-handler'
import { PODCAST_ID } from '@/lib/firebase/config'
import { createJob } from '@/lib/firebase/jobs-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { saveSocialPostFromLLM } from '@/lib/firebase/social-admin'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { runJobInBackground } from '@/lib/jobs/run-job-in-background'
import { callGenAI, cleanupTranscriptionFile, createTranscriptionFile } from '@/lib/llm/client'
import { LLMError } from '@/lib/llm/errors'
import { llmQueue } from '@/lib/llm/queue'
import { buildSocialSystemPrompt, buildSocialUserPrompt, shouldAttachTranscription } from '@/lib/llm/social-prompts'
import { SocialPostUpdateSchema } from '@/lib/schemas'
import { log } from '@/lib/logger'
import type { Podcast } from '@/types/podcast'

export const runtime = 'nodejs'

const RequestBodySchema = z.object({
  additionalContext: z.string().max(500).optional(),
})

interface RouteContext {
  params: Promise<{ videoId: string; networkId: string }>
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId, networkId } = await context.params
  const isAsync = request.nextUrl.searchParams.get('mode') === 'async'

  try {
    // Parse optional body
    const rawBody = await request.json().catch(() => ({}))
    const bodyResult = RequestBodySchema.safeParse(rawBody)
    if (!bodyResult.success && Object.keys(rawBody).length > 0) {
      log('WARN', 'Invalid request body for social post generation', {
        videoId,
        networkId,
        issues: bodyResult.error.issues,
      })
      return createErrorResponse('VALIDATION_ERROR', 'Body inválido', 400)
    }
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

    // Validate video prerequisites. Theme is only context for the prompt and is
    // intentionally empty for standalone videos (vídeo avulso has no parent
    // episode), so it is not required when video.standalone is true.
    const missingPrerequisites: string[] = []
    if (!video.title) missingPrerequisites.push('título')
    if (!video.theme && !video.standalone) missingPrerequisites.push('tema')
    if (!video.description) missingPrerequisites.push('descrição')
    if (missingPrerequisites.length > 0) {
      return createErrorResponse(
        'MISSING_PREREQUISITES',
        `Video precisa ter ${missingPrerequisites.join(', ')} otimizado(s) antes de gerar post social`,
        400
      )
    }

    // Validate prompt exists for this networkId + videoType
    const videoType = video.videoType || 'episode'
    const socialPrompts = podcast.prompts[videoType]?.social
    const promptConfig = socialPrompts?.[networkId]

    if (!promptConfig || !promptConfig.description || !promptConfig.expectedOutput) {
      return createErrorResponse(
        'MISSING_PROMPT',
        `Prompt não configurado para ${networkId}`,
        400
      )
    }

    // Fetch parent video for cut/reel
    let parentVideo = null
    if ((video.videoType === 'cut' || video.videoType === 'reel') && video.parentEpisodeId) {
      parentVideo = await getVideoAdmin(PODCAST_ID, video.parentEpisodeId)
    }

    // Build prompts
    const persona = podcast.personas?.socialmedia
    if (!persona?.role) {
      log('WARN', 'socialmedia persona not configured, using empty fallback', { videoId, networkId })
    }

    const systemPrompt = buildSocialSystemPrompt(persona, promptConfig, additionalContext)
    const userPrompt = buildSocialUserPrompt(video, parentVideo)

    // Build debug context only when llmDebugMode is enabled (zero overhead when disabled)
    const debugContext = podcast?.features?.llmDebugMode
      ? { component: `social/generate/${networkId}`, videoId, videoType: (video.videoType || 'episode') as 'episode' | 'cut' | 'reel', podcastId: PODCAST_ID }
      : undefined

    // Trabalho LLM + persistência, compartilhado entre os caminhos sync e async
    // (Epic 27). Retorna o MESMO payload que o caminho síncrono devolvia ao
    // cliente. Lança LLMError/ZodError em falha (mapeados abaixo no sync; no
    // async, runJobInBackground grava a falha no job).
    const runGeneration = async (): Promise<{
      payload: { networkId: string; cta: string; body: string; hashtags: string[]; processedBy: 'llm' }
      usage: { promptTokens: number; completionTokens: number; totalTokens: number }
    }> => {
      let attachmentPath: string | undefined
      try {
        if (shouldAttachTranscription(video)) {
          attachmentPath = await createTranscriptionFile(video.transcriptionTXT!, 0)
        }

        const { data, usage } = await llmQueue.enqueue(() =>
          callGenAI<{ cta: string; body: string; hashtags: string[] }>(
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

        const validated = SocialPostUpdateSchema.parse(data)
        await saveSocialPostFromLLM(videoId, networkId, validated, additionalContext)

        log('INFO', 'Social post generated via LLM', { videoId, networkId, videoType, mode: isAsync ? 'async' : 'sync' })

        return { payload: { networkId, ...validated, processedBy: 'llm' }, usage }
      } finally {
        if (attachmentPath) {
          await cleanupTranscriptionFile(attachmentPath)
        }
      }
    }

    if (isAsync) {
      const jobId = await createJob(PODCAST_ID, {
        type: 'social-post',
        context: { videoId, networkId },
      })
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
      log('WARN', 'LLM error during social post generation', {
        videoId,
        networkId,
        code: error.code,
        message: error.message,
      })
      return createErrorResponse(error.code, error.message, status)
    }

    if (error instanceof z.ZodError) {
      log('WARN', 'Invalid LLM response for social post', {
        videoId,
        networkId,
        issues: error.issues,
      })
      return createErrorResponse('INVALID_RESPONSE', 'Resposta do LLM em formato inválido', 500)
    }

    log('ERROR', 'Failed to generate social post', {
      videoId,
      networkId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao gerar post social', 500)
  }
}
