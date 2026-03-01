import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { GoogleGenAI } from '@google/genai'

import { GCP_REGION, PROJECT_ID, VERTEX_AI_MODEL } from '@/lib/firebase/config'
import { log } from '@/lib/logger'
import type { WizardPhase } from '@/lib/wizard'
import type { Podcast } from '@/types/podcast'
import type { DebugContext } from '@/types/llm-log'
import type { Video } from '@/types/video'

import { createLLMError, LLMError } from './errors'
import { extractVariables, interpolatePrompt, validateVideoForPhase } from './interpolation'
import { parseJSONFromLLM } from './parse-json'
import { buildPhasePrompt, getSystemPrompt, getUserPromptTemplate, PHASE_CONFIG } from './prompts'
import { llmQueue } from './queue'
import { MAX_PARSE_RETRIES, PHASE_TIMEOUTS, RETRY_DELAY_MS } from './types'
import type {
  LLMCallOptions,
  LLMResult,
  Phase1Response,
  Phase2Response,
  Phase3Response,
  Phase4Response,
  Phase5Response,
  Phase6Response,
  Phase7Response,
} from './types'

/**
 * Default model if VERTEX_AI_MODEL is not configured.
 */
const DEFAULT_MODEL = 'gemini-2.5-flash'

/**
 * Google GenAI client singleton.
 * Uses Vertex AI backend with Application Default Credentials (ADC).
 *
 * - Local: Run `gcloud auth application-default login`
 * - Cloud Run: Automatically uses the service account assigned to the service
 */
let ai: GoogleGenAI | undefined

/**
 * Gets or initializes the Google GenAI client.
 */
export function getAI(): GoogleGenAI {
  if (ai) return ai

  ai = new GoogleGenAI({
    vertexai: true,
    project: PROJECT_ID,
    location: GCP_REGION,
  })

  return ai
}

/**
 * Resets the GenAI client singleton.
 * Useful for testing or when configuration changes.
 */
export function resetGenAIClient(): void {
  ai = undefined
}

// Backward-compatible alias
export { resetGenAIClient as resetVertexAIClient }

// =============================================================================
// FILE ATTACHMENT SUPPORT (per llm.md specification)
// =============================================================================

/**
 * Create a temporary file with the transcription content.
 * Returns the file path for later cleanup.
 *
 * @param content - Transcription content (TXT or SRT)
 * @param phase - Phase number for filename
 * @returns Path to temporary file
 */
export async function createTranscriptionFile(content: string, phase: number): Promise<string> {
  const tempDir = os.tmpdir()
  const filename = `iara-transcription-phase${phase}-${Date.now()}.txt`
  const filePath = path.join(tempDir, filename)

  await fs.writeFile(filePath, content, 'utf-8')
  log('INFO', 'Created temporary transcription file', { filePath, size: content.length })

  return filePath
}

/**
 * Clean up temporary transcription file.
 *
 * @param filePath - Path to temporary file
 */
export async function cleanupTranscriptionFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
    log('INFO', 'Cleaned up temporary transcription file', { filePath })
  } catch (error) {
    // Log but don't throw - cleanup failures shouldn't break the flow
    log('WARN', 'Failed to cleanup temporary file', { filePath, error })
  }
}

/**
 * Read file content and encode as base64 for inlineData.
 *
 * @param filePath - Path to file
 * @returns Base64 encoded content
 */
async function readFileAsBase64(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath)
  return content.toString('base64')
}

/**
 * Call GenAI with the given prompts and optional file attachment.
 *
 * Per llm.md specification:
 * - Transcription MUST be saved as temporary file and passed as attachment
 * - NOT sent inline in the prompt
 *
 * Features automatic retry for PARSE_ERROR (up to MAX_PARSE_RETRIES attempts).
 * Other errors (TIMEOUT, RATE_LIMIT, etc.) fail immediately without retry.
 *
 * @param systemPrompt - System instruction for the model
 * @param userPrompt - User prompt with context (without transcription)
 * @param _timeout - Timeout in milliseconds (reserved for future use)
 * @param attachmentPath - Optional path to transcription file to attach
 *
 * @see Story 5.4 - Auto-Retry em PARSE_ERROR
 */
export async function callGenAI<T>(
  systemPrompt: string,
  userPrompt: string,
  _timeout: number,
  attachmentPath: string | undefined,
  debugContext?: DebugContext
): Promise<{ data: T; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const client = getAI()
  const modelName = VERTEX_AI_MODEL || DEFAULT_MODEL

  // Build parts array once - reused across retry attempts
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: userPrompt },
  ]

  // Track attachment metadata for debug logging
  let attachmentInfo: { sizeKB: number; estimatedTokens: number } | undefined

  if (attachmentPath) {
    const base64Content = await readFileAsBase64(attachmentPath)
    parts.push({
      inlineData: {
        mimeType: 'text/plain',
        data: base64Content,
      },
    })

    // Compute attachment size: base64 inflates ~33%, so original ≈ base64 * 3/4
    const originalSizeBytes = Math.ceil(base64Content.length * 3 / 4)
    attachmentInfo = {
      sizeKB: Math.round(originalSizeBytes / 1024 * 100) / 100,
      // Rough estimate: ~4 bytes per token for Portuguese text
      estimatedTokens: Math.round(originalSizeBytes / 4),
    }

    log('INFO', 'Added transcription attachment to request', {
      attachmentPath,
      base64Length: base64Content.length,
      sizeKB: attachmentInfo.sizeKB,
    })
  }

  // Retry loop for PARSE_ERROR only
  for (let attempt = 1; attempt <= MAX_PARSE_RETRIES; attempt++) {
    try {
      // Use streaming API to keep the connection alive during model thinking.
      // Each chunk keeps the HTTP connection active, preventing idle timeouts.
      const stream = await client.models.generateContentStream({
        model: modelName,
        contents: parts,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.7,
          maxOutputTokens: 65536,
          // Gemini 2.5 Flash thinking tokens share the maxOutputTokens budget (65K).
          // Without a cap, the model non-deterministically consumes 60K+ on thinking,
          // leaving insufficient room for output → MAX_TOKENS truncation.
          // API max for thinking_budget is 24576. Leaves ~41K for visible output.
          thinkingConfig: { thinkingBudget: 24576 },
        },
      })

      // Consume stream chunks and accumulate text.
      // The SDK sends incremental chunks (deltas) — each chunk.text only
      // contains the NEW text since the last chunk, not the full response.
      // We must concatenate all chunks to reconstruct the complete response.
      let chunkCount = 0
      let fullText = ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- chunk type inferred from stream
      let lastChunk: any
      for await (const chunk of stream) {
        chunkCount++
        lastChunk = chunk
        const chunkText = chunk.text
        if (chunkText) fullText += chunkText
        if (chunkCount === 1) {
          log('INFO', 'First stream chunk received', { attempt })
        }
      }
      log('INFO', `Stream completed (${chunkCount} chunks)`, { attempt, fullTextLength: fullText.length })

      // Extract metadata from last chunk (finishReason, usageMetadata arrive in the final SSE event)
      const candidate = lastChunk!.candidates?.[0]
      const finishReason = candidate?.finishReason
      const safetyRatings = candidate?.safetyRatings
      const usageMetadata = lastChunk!.usageMetadata
      const text = fullText || undefined

      // Diagnostic logging for every attempt
      log('INFO', `LLM response received (attempt ${attempt}/${MAX_PARSE_RETRIES})`, {
        finishReason,
        safetyRatings,
        promptTokens: usageMetadata?.promptTokenCount,
        outputTokens: usageMetadata?.candidatesTokenCount,
        totalTokens: usageMetadata?.totalTokenCount,
        responseLength: text?.length ?? 0,
      })

      if (!text) {
        throw new LLMError('INVALID_RESPONSE', 'Nenhum texto na resposta', false)
      }

      // Parse JSON with robust extraction (handles markdown code blocks, extra text, etc.)
      const data = parseJSONFromLLM<T>(text)
      if (data === null) {
        // Dump full raw response to file for debugging
        const dumpPath = path.join(os.tmpdir(), `iara-parse-error-attempt${attempt}-${Date.now()}.txt`)
        await fs.writeFile(dumpPath, text, 'utf-8')

        // Log parse failure with attempt info
        log('WARN', `PARSE_ERROR on attempt ${attempt}/${MAX_PARSE_RETRIES}`, {
          finishReason,
          rawResponseLength: text.length,
          rawResponsePreview: text.substring(0, 300),
          rawResponseEnd: text.length > 300 ? text.substring(text.length - 200) : undefined,
          dumpPath,
        })

        // Check if we should retry
        if (attempt < MAX_PARSE_RETRIES) {
          log('INFO', `Retrying LLM call (attempt ${attempt + 1}/${MAX_PARSE_RETRIES})`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
          continue // Try again
        }

        // All retries exhausted
        log('ERROR', 'Failed to parse JSON after all retries', {
          attempts: MAX_PARSE_RETRIES,
          rawResponseEnd: text.length > 500 ? text.substring(text.length - 200) : text,
        })
        throw new LLMError(
          'PARSE_ERROR',
          `Erro ao parsear resposta após ${MAX_PARSE_RETRIES} tentativas. O LLM retornou dados em formato inválido.`,
          false
        )
      }

      // Success - log if this was a retry
      if (attempt > 1) {
        log('INFO', `LLM call succeeded on attempt ${attempt}/${MAX_PARSE_RETRIES}`)
      }

      // Extract usage metadata
      const usage = {
        promptTokens: usageMetadata?.promptTokenCount || 0,
        completionTokens: usageMetadata?.candidatesTokenCount || 0,
        totalTokens: usageMetadata?.totalTokenCount || 0,
      }

      // Save debug log if debugContext provided (llmDebugMode enabled at caller)
      if (debugContext) {
        try {
          const { saveLlmLog } = await import('@/lib/firebase/llm-log-admin')
          await saveLlmLog(debugContext.podcastId, {
            component: debugContext.component,
            model: modelName,
            videoId: debugContext.videoId,
            videoType: debugContext.videoType,
            prompt: { system: systemPrompt, user: userPrompt },
            response: text,
            attachment: attachmentInfo,
            usage,
          })
        } catch (logError) {
          // Never fail the LLM call because of debug logging
          log('WARN', 'Failed to save LLM debug log', {
            error: logError instanceof Error ? logError.message : JSON.stringify(logError),
          })
        }
      }

      return { data, usage }
    } catch (error) {
      // Log full error details before converting
      if (!(error instanceof LLMError)) {
        const err = error as Error & { status?: number; statusText?: string; cause?: unknown }
        log('ERROR', 'Raw API error details', {
          attempt,
          name: err?.name,
          message: err?.message,
          status: err?.status,
          statusText: err?.statusText,
          cause: err?.cause ? String(err.cause) : undefined,
          stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
        })
      }

      if (error instanceof LLMError) {
        throw error
      }
      throw createLLMError(error)
    }
  }

  // Should not reach here, but TypeScript needs this
  throw new LLMError('PARSE_ERROR', 'Erro inesperado no loop de retry', false)
}

/**
 * Get the appropriate response type based on phase.
 */
type PhaseResponseMap = {
  1: Phase1Response
  2: Phase2Response
  3: Phase3Response
  4: Phase4Response
  5: Phase5Response
  6: Phase6Response
  7: Phase7Response
  8: never
}

/**
 * Call LLM for a specific wizard phase.
 *
 * Uses Google GenAI SDK with Vertex AI backend and Application Default Credentials (ADC).
 *
 * Per llm.md specification:
 * - Prompts are built using podcast.personas and podcast.prompts
 * - Transcription is sent as file attachment (not inline)
 * - Falls back to BASE_SYSTEM_PROMPTS when podcast not configured
 *
 * @param phase - The wizard phase (1-7, phase 8 has no LLM call)
 * @param video - The video being processed
 * @param podcast - Optional podcast with personas and prompts configuration
 * @param options - Call options (promptOverride, additionalContext, timeout)
 * @returns LLMResult with success/failure and data/error
 */
export async function callLLM<P extends Exclude<WizardPhase, 8>>(
  phase: P,
  video: Video,
  podcast?: Podcast,
  options?: LLMCallOptions
): Promise<LLMResult<PhaseResponseMap[P]>> {
  // Validate video has required data
  const validation = validateVideoForPhase(video, phase)

  if (!validation.valid) {
    const code = validation.missingFields.includes('transcrição')
      ? 'MISSING_TRANSCRIPT'
      : 'MISSING_CONTEXT'

    return {
      success: false,
      error: {
        code,
        message: `Dados faltando: ${validation.missingFields.join(', ')}`,
        retryable: false,
      },
    }
  }

  // Get phase configuration
  const phaseConfig = PHASE_CONFIG[phase]
  const videoType = video.videoType || 'episode'

  // Determine which transcription to use based on phase config
  const transcription = phaseConfig.attachmentType === 'TXT'
    ? (video.transcriptionTXT || video.transcriptionSRT || '')
    : (video.transcriptionSRT || video.transcriptionTXT || '')

  // Create temporary file for transcription attachment
  let transcriptionFilePath: string | undefined

  try {
    // Build system prompt using podcast personas/prompts or fallback
    let systemPrompt: string

    if (options?.promptOverride) {
      systemPrompt = options.promptOverride
      log('INFO', 'Using prompt override', { phase })
    } else if (podcast?.personas && podcast?.prompts) {
      // Use llm.md template with podcast configuration
      const persona = podcast.personas[phaseConfig.personaName]
      systemPrompt = buildPhasePrompt(phase, persona, podcast.prompts, videoType)

      // Check if we got a fallback (buildPhasePrompt returns BASE_SYSTEM_PROMPTS when config incomplete)
      const isFallback = !persona?.role || !podcast.prompts[videoType]
      log('INFO', isFallback ? 'Using fallback prompts' : 'Using configured prompts', {
        phase,
        personaName: phaseConfig.personaName,
        videoType,
      })
    } else {
      // Fallback to base prompts
      systemPrompt = getSystemPrompt(phase)
      log('INFO', 'Using fallback prompts (no podcast config)', { phase })
    }

    // For Type 1 (Reprocessable) phases (5, 6, 7), append additionalContext to system prompt
    // This ensures the model pays attention to the user's specific instructions
    // Per processamento_video.md: "Dê uma atenção especial a essa instrução: {additionalContext}"
    if (options?.additionalContext && [5, 6, 7].includes(phase)) {
      systemPrompt += `\n\n**INSTRUÇÃO PRIORITÁRIA DO PRODUTOR:**\nDê uma atenção especial a essa instrução: ${options.additionalContext}`
      log('INFO', 'Added additional context to system prompt', {
        phase,
        additionalContextLength: options.additionalContext.length,
      })
    }

    // Build user prompt (without transcription - it goes as attachment)
    const userTemplate = getUserPromptTemplate(phase)
    const variables = extractVariables(video, options?.previousPhaseData, podcast?.hostName)
    // Clear transcript from variables since it will be sent as attachment
    variables.transcript = '[Transcrição anexada como arquivo]'
    const userPrompt = interpolatePrompt(userTemplate, variables, options?.additionalContext)

    // Get timeout for this phase
    const timeout = options?.timeout || getPhaseTimeout(phase)

    // Log generated prompts for debugging/testing
    log('INFO', 'Generated LLM prompts', {
      phase,
      videoType,
      systemPrompt,
      userPrompt,
      transcriptionLength: transcription.length,
    })

    // Create transcription file and call API with attachment
    transcriptionFilePath = await createTranscriptionFile(transcription, phase)

    const { data, usage } = await callGenAI<PhaseResponseMap[P]>(
      systemPrompt,
      userPrompt,
      timeout,
      transcriptionFilePath,
      options?.debugContext
    )

    return {
      success: true,
      data,
      usage,
    }
  } catch (error) {
    if (error instanceof LLMError) {
      return error.toResult()
    }

    return createLLMError(error).toResult()
  } finally {
    // Always cleanup temporary file
    if (transcriptionFilePath) {
      await cleanupTranscriptionFile(transcriptionFilePath)
    }
  }
}

/**
 * Get the timeout for a phase.
 * Uses centralized PHASE_TIMEOUTS from types.ts.
 */
function getPhaseTimeout(phase: WizardPhase): number {
  return PHASE_TIMEOUTS[phase]
}

/**
 * Check if LLM is available.
 * Uses ADC, so it's always "configured" if running in GCP
 * or locally with `gcloud auth application-default login`.
 */
export function isLLMConfigured(): boolean {
  return true
}

/**
 * Call LLM for a specific wizard phase using the queue.
 *
 * This is the recommended way to call LLM as it ensures calls are
 * processed sequentially, preventing rate-limit issues and
 * performance degradation from concurrent calls.
 *
 * @param phase - The wizard phase (1-7, phase 8 has no LLM call)
 * @param video - The video being processed
 * @param podcast - Optional podcast with personas and prompts configuration
 * @param options - Call options (promptOverride, additionalContext, timeout)
 * @returns LLMResult with success/failure and data/error
 */
export async function callLLMQueued<P extends Exclude<WizardPhase, 8>>(
  phase: P,
  video: Video,
  podcast?: Podcast,
  options?: LLMCallOptions
): Promise<LLMResult<PhaseResponseMap[P]>> {
  return llmQueue.enqueue(() => callLLM(phase, video, podcast, options))
}
