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
 * Returns:
 * - Success: { data: { shortTitles: string[] }, usage: { ... } }
 * - Error: { error: { code: string, message: string } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import {
  createTranscriptionFile,
  cleanupTranscriptionFile,
  parseJSONFromLLM,
  LLMError,
  createLLMError,
} from '@/lib/llm'
import type { Phase5BResponse } from '@/lib/llm'
import { log } from '@/lib/logger'

import { GenerativeModel, VertexAI } from '@google-cloud/vertexai'
import type { Part } from '@google-cloud/vertexai'
import { GCP_REGION, PROJECT_ID, VERTEX_AI_MODEL } from '@/lib/firebase/config'

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
 * Timeout for phase 5B (2 minutes).
 */
const PHASE_5B_TIMEOUT = 120000

/**
 * Default model if VERTEX_AI_MODEL is not configured.
 */
const DEFAULT_MODEL = 'gemini-2.5-flash'

/**
 * Get Vertex AI model for phase 5B.
 */
function getModel(): GenerativeModel {
  const vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: GCP_REGION,
  })

  return vertexAI.getGenerativeModel({
    model: VERTEX_AI_MODEL || DEFAULT_MODEL,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  })
}

/**
 * Read file content and encode as base64.
 */
async function readFileAsBase64(filePath: string): Promise<string> {
  const fs = await import('fs/promises')
  const content = await fs.readFile(filePath)
  return content.toString('base64')
}

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
Sua tarefa: ${podcast.prompts.cut.thumbs.description}
Seu retorno deve ser estritamente: ${podcast.prompts.cut.thumbs.expectedOutput}

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

  try {
    const body = await request.json()
    const requestData = Phase5BRequestSchema.parse(body)
    const { videoId, additionalContext } = requestData

    // Get video from Firestore
    const video = await getVideoAdmin(PODCAST_ID, videoId)

    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
        { status: 404 }
      )
    }

    // Validate video is a cut (only cuts have phase 5B)
    if (video.videoType !== 'cut') {
      return NextResponse.json(
        { error: { code: 'INVALID_VIDEO_TYPE', message: 'Fase 5B é exclusiva para vídeos do tipo cut' } },
        { status: 400 }
      )
    }

    // Validate video has transcription
    const transcription = video.transcriptionTXT || video.transcriptionSRT
    if (!transcription) {
      return NextResponse.json(
        { error: { code: 'MISSING_TRANSCRIPT', message: 'Vídeo não possui transcrição' } },
        { status: 400 }
      )
    }

    // Load podcast config for prompts
    const podcast = await getPodcastAdmin(PODCAST_ID)

    log('INFO', 'Processing phase 5B short titles', {
      videoId,
      hasAdditionalContext: !!additionalContext,
      hasPodcastConfig: !!(podcast?.prompts?.cut?.thumbs),
    })

    // Build prompts
    const systemPrompt = buildPhase5BPrompt(podcast, additionalContext)
    const userPrompt = `## Contexto do Corte

**Título do episódio original:** ${video.title || 'Sem título'}
**Título selecionado para o corte:** ${video.title || 'Não definido'}
**Duração:** ${video.duration ? `${Math.floor(video.duration / 60)}min ${video.duration % 60}s` : 'Não informada'}
**Tema:** ${video.theme || 'Não informado'}

**Convidados:**
${video.guests?.map(g => `- ${g.name} (${g.role || 'Convidado'})`).join('\n') || 'Não informado'}

[Transcrição anexada como arquivo]`

    // Create transcription file
    const transcriptionFilePath = await createTranscriptionFile(transcription, 5)

    try {
      const model = getModel()
      const base64Content = await readFileAsBase64(transcriptionFilePath)

      const parts: Part[] = [
        { text: userPrompt },
        {
          inlineData: {
            mimeType: 'text/plain',
            data: base64Content,
          },
        },
      ]

      // Call LLM with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new LLMError('TIMEOUT', 'A requisição demorou demais. Tente novamente.', true))
        }, PHASE_5B_TIMEOUT)
      })

      const result = await Promise.race([
        model.generateContent({
          contents: [{ role: 'user', parts }],
          systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
        }),
        timeoutPromise,
      ])

      const response = result.response
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text

      if (!text) {
        throw new LLMError('INVALID_RESPONSE', 'Nenhum texto na resposta', false)
      }

      // Parse JSON response
      const data = parseJSONFromLLM<Phase5BResponse>(text)
      if (!data || !Array.isArray(data.shortTitles)) {
        throw new LLMError('PARSE_ERROR', 'Erro ao parsear resposta do LLM', false)
      }

      // Extract usage metadata
      const usageMetadata = response.usageMetadata
      const usage = {
        promptTokens: usageMetadata?.promptTokenCount || 0,
        completionTokens: usageMetadata?.candidatesTokenCount || 0,
        totalTokens: usageMetadata?.totalTokenCount || 0,
      }

      // Persist suggestedShortTitles to Firestore
      await updateVideoAdmin(PODCAST_ID, videoId, {
        suggestedShortTitles: data.shortTitles,
      })

      log('INFO', 'Phase 5B short titles generated successfully', {
        videoId,
        shortTitleCount: data.shortTitles.length,
        tokensUsed: usage.totalTokens,
      })

      return NextResponse.json({
        data,
        usage,
      })
    } finally {
      // Cleanup transcription file
      await cleanupTranscriptionFile(transcriptionFilePath)
    }
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
