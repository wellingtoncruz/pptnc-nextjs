/**
 * API routes for video topics.
 *
 * PUT: Save manually edited topics
 * POST: Generate topics via LLM categorization
 *
 * Topics are stored flat on the video document as Array<string>.
 *
 * @see Story 20.1 — Topic categorization via LLM
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { listTopicNames } from '@/lib/firebase/topics-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { callGenAI } from '@/lib/llm/client'
import { LLMError } from '@/lib/llm/errors'
import { llmQueue } from '@/lib/llm/queue'
import { log } from '@/lib/logger'
import {
  authExpiredResponse,
  notFoundResponse,
  handleVideoFieldError,
} from '@/lib/api/video-field-handler'
import type { Podcast } from '@/types/podcast'

const TopicsUpdateSchema = z.object({
  topics: z.array(z.string().min(1).max(200)).max(20, 'Máximo de 20 tópicos'),
})

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * PUT /api/videos/[videoId]/topics
 *
 * Saves manually edited topics for a video.
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params

  try {
    const body = await request.json()
    const { topics } = TopicsUpdateSchema.parse(body)

    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return notFoundResponse('Video')
    }

    await updateVideoAdmin(PODCAST_ID, videoId, { topics })

    log('INFO', 'Video topics updated', { videoId, topicCount: topics.length })

    return NextResponse.json({
      data: { videoId, topicCount: topics.length },
    })
  } catch (error) {
    return handleVideoFieldError(error, 'topics', videoId)
  }
}

/**
 * POST /api/videos/[videoId]/topics
 *
 * Generates topic categorization via LLM.
 * Reads available topics from podcasts/{podcastId}/topics,
 * asks the LLM to classify the video, and persists the result.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session || session.error) {
    return authExpiredResponse()
  }

  const { videoId } = await context.params

  try {
    // Load video, podcast settings, and topic names in parallel
    const [video, podcast, topicNames] = await Promise.all([
      getVideoAdmin(PODCAST_ID, videoId),
      getPodcastAdmin(PODCAST_ID) as Promise<Podcast | null>,
      listTopicNames(PODCAST_ID),
    ])

    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
        { status: 404 }
      )
    }

    if (topicNames.length === 0) {
      log('WARN', 'No topics configured, skipping categorization', { videoId })
      return NextResponse.json({
        data: { videoId, topics: [], skipped: true },
      })
    }

    // Build prompts
    const persona = podcast?.personas?.writer
    const videoType = video.videoType || 'episode'
    const promptConfig = (podcast?.prompts as Record<string, Record<string, unknown>>)?.[videoType]?.topics as
      | { description: string; expectedOutput: string }
      | undefined

    const systemPrompt = buildTopicsSystemPrompt(persona, promptConfig)
    const userPrompt = buildTopicsUserPrompt(video, topicNames)

    // Call LLM via queue
    const { data } = await llmQueue.enqueue(() =>
      callGenAI<{ topics: string[] }>(systemPrompt, userPrompt, 30000, undefined, undefined, podcast?.llmConfig?.textModel, podcast?.llmConfig?.provider)
    )

    // Filter: only keep topics that exist in the catalog
    const validTopics = (data.topics || []).filter((t: string) =>
      topicNames.some((name) => name.toLowerCase() === t.toLowerCase())
    )

    // Persist topics
    await updateVideoAdmin(PODCAST_ID, videoId, { topics: validTopics })

    log('INFO', 'Video topics generated via LLM', {
      videoId,
      topicCount: validTopics.length,
      discarded: data.topics.length - validTopics.length,
    })

    return NextResponse.json({
      data: { videoId, topics: validTopics },
    })
  } catch (error) {
    if (error instanceof LLMError) {
      const status = error.code === 'RATE_LIMIT' ? 429 : 500
      log('WARN', 'LLM error during topic categorization', {
        videoId,
        code: error.code,
        message: error.message,
      })
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log('ERROR', 'Failed to generate topics for video', {
      podcastId: PODCAST_ID,
      videoId,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao categorizar tópicos' } },
      { status: 500 }
    )
  }
}

// =============================================================================
// Prompt builders
// =============================================================================

function buildTopicsSystemPrompt(
  persona?: { role: string; objective: string; resume: string },
  promptConfig?: { description: string; expectedOutput: string }
): string {
  const base = `Você é um especialista em categorização de conteúdo de podcasts.
Analise o vídeo e classifique-o nos tópicos mais relevantes da lista fornecida.

Regras OBRIGATÓRIAS:
- Escolha APENAS tópicos da lista fornecida
- Selecione entre 1 e 5 tópicos mais relevantes
- Priorize tópicos que representam o tema central do vídeo
- NÃO invente tópicos novos

Sua resposta DEVE ser um JSON válido:
{
  "topics": ["Tópico A", "Tópico B"]
}`

  if (persona && promptConfig?.description) {
    return `Seu papel: ${persona.role}
Seu objetivo: ${persona.objective}
Seu contexto: ${persona.resume}

## TAREFA
${promptConfig.description}

${base}`
  }

  return base
}

function buildTopicsUserPrompt(
  video: { title: string; description?: string; theme?: string; tags?: string[]; transcriptionTXT?: string },
  topicNames: string[]
): string {
  const sections: string[] = []

  sections.push(`## Informações do Vídeo\n`)
  sections.push(`**Título:** ${video.title}`)
  if (video.theme) sections.push(`**Tema:** ${video.theme}`)
  if (video.description) sections.push(`**Descrição:** ${video.description.slice(0, 500)}`)
  if (video.tags?.length) sections.push(`**Tags:** ${video.tags.join(', ')}`)
  if (video.transcriptionTXT) sections.push(`\n**Transcrição (trecho):**\n${video.transcriptionTXT.slice(0, 2000)}`)

  sections.push(`\n## Tópicos Disponíveis\n`)
  sections.push(topicNames.map((name, i) => `${i + 1}. ${name}`).join('\n'))

  sections.push(`\nEscolha os tópicos mais relevantes da lista acima.`)

  return sections.join('\n')
}
