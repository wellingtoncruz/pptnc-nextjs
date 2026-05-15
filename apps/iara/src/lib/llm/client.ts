import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { GoogleGenAI } from '@google/genai'

import { PROJECT_ID, VERTEX_AI_LOCATION, VERTEX_AI_MODEL } from '@/lib/firebase/config'
import { log } from '@/lib/logger'
import type { WizardPhase } from '@/lib/wizard'
import type { Podcast } from '@/types/podcast'
import type { DebugContext } from '@/types/llm-log'
import type { Video } from '@/types/video'

import { createLLMError, extractRateLimitDetails, isRetryableError, LLMError } from './errors'
import { extractVariables, interpolatePrompt, validateVideoForPhase } from './interpolation'
import { parseJSONFromLLM } from './parse-json'
import { buildPhasePrompt, getSystemPrompt, getUserPromptTemplate, PHASE_CONFIG } from './prompts'
import { getLLMProvider, resolveProviderName } from './providers/factory'
import type { LLMProvider, ProviderAttachment } from './providers/types'
import { llmQueue } from './queue'
import { MAX_PARSE_RETRIES, MAX_RETRYABLE_ATTEMPTS, PHASE_TIMEOUTS, RETRY_DELAY_MS, RETRYABLE_DELAYS } from './types'
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
    location: VERTEX_AI_LOCATION,
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
 * Read a file as UTF-8 text. Used pra entregar transcrição crua ao provider —
 * o provider faz a codificação base64 / inline conforme seu shape nativo.
 */
async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
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
  debugContext?: DebugContext,
  modelOverride?: string,
  providerOverride?: 'gemini' | 'claude'
): Promise<{ data: T; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  // Resolver provider e default model. Pra Gemini, default é VERTEX_AI_MODEL ou
  // DEFAULT_MODEL; pra Claude, fica a cargo do AnthropicProvider.defaultModel
  // (já tratado se modelOverride for undefined).
  const provider = getLLMProvider(providerOverride ? { llmConfig: { provider: providerOverride } } : undefined)
  const modelName = modelOverride || (provider.name === 'gemini' ? (VERTEX_AI_MODEL || DEFAULT_MODEL) : provider.defaultModel)

  // Build attachment for provider (text/plain transcrição). Provider faz a
  // codificação base64 internamente — não precisa pré-processar aqui.
  let attachment: ProviderAttachment | undefined
  let attachmentInfo: { sizeKB: number; estimatedTokens: number } | undefined

  if (attachmentPath) {
    const content = await readFile(attachmentPath)
    attachment = { mimeType: 'text/plain', content }
    const originalSizeBytes = Buffer.byteLength(content, 'utf-8')
    attachmentInfo = {
      sizeKB: Math.round((originalSizeBytes / 1024) * 100) / 100,
      // Rough estimate: ~4 bytes per token for Portuguese text
      estimatedTokens: Math.round(originalSizeBytes / 4),
    }

    log('INFO', 'Added transcription attachment to request', {
      attachmentPath,
      sizeKB: attachmentInfo.sizeKB,
    })
  }

  // Outer retry loop for retryable errors (RATE_LIMIT, TIMEOUT, NETWORK_ERROR, API_ERROR)
  for (let retryAttempt = 0; retryAttempt < MAX_RETRYABLE_ATTEMPTS; retryAttempt++) {
    try {
      return await _callGenAIInner<T>(
        provider,
        modelName,
        systemPrompt,
        userPrompt,
        attachment,
        attachmentInfo,
        debugContext
      )
    } catch (error) {
      const llmError = error instanceof LLMError ? error : createLLMError(error)

      // Log full error details for non-LLMError
      if (!(error instanceof LLMError)) {
        const err = error as Error & { status?: number; statusText?: string; cause?: unknown }
        log('ERROR', 'Raw API error details', {
          retryAttempt,
          name: err?.name,
          message: err?.message,
          status: err?.status,
          statusText: err?.statusText,
          cause: err?.cause ? String(err.cause) : undefined,
          stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
        })
      }

      // For RATE_LIMIT, surface Vertex quota metadata so we can identify which limit was hit.
      // Vertex returns this via structured details[] (QuotaFailure/RetryInfo) and/or the message text.
      let rateLimitDetails: ReturnType<typeof extractRateLimitDetails> | undefined
      if (llmError.code === 'RATE_LIMIT') {
        rateLimitDetails = extractRateLimitDetails(error)
        log('WARN', '[Vertex AI] RATE_LIMIT details', {
          httpCode: rateLimitDetails.httpCode,
          status: rateLimitDetails.status,
          quotaMetric: rateLimitDetails.quota.quotaMetric,
          quotaId: rateLimitDetails.quota.quotaId,
          modelName: rateLimitDetails.quota.modelName ?? modelName,
          endpointLocation: VERTEX_AI_LOCATION,
          servedRegion: rateLimitDetails.quota.region,
          projectNumber: rateLimitDetails.quota.projectNumber,
          retryAfterSeconds: rateLimitDetails.quota.retryAfterSeconds,
          rawMessage: rateLimitDetails.rawMessage?.slice(0, 500),
        })
      }

      // Check if this error is retryable and we have attempts remaining
      if (isRetryableError(llmError.code) && retryAttempt < MAX_RETRYABLE_ATTEMPTS - 1) {
        const delayMs = RETRYABLE_DELAYS[retryAttempt]
        log('WARN', `Retryable error "${llmError.code}" on attempt ${retryAttempt + 1}/${MAX_RETRYABLE_ATTEMPTS}, waiting ${delayMs / 1000}s before retry...`, {
          errorCode: llmError.code,
          errorMessage: llmError.message,
          nextAttempt: retryAttempt + 2,
          delaySeconds: delayMs / 1000,
          quotaMetric: rateLimitDetails?.quota.quotaMetric,
          quotaId: rateLimitDetails?.quota.quotaId,
          modelName: rateLimitDetails?.quota.modelName ?? (llmError.code === 'RATE_LIMIT' ? modelName : undefined),
        })
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }

      // Not retryable or retries exhausted — propagate
      if (isRetryableError(llmError.code) && retryAttempt === MAX_RETRYABLE_ATTEMPTS - 1) {
        log('ERROR', `All ${MAX_RETRYABLE_ATTEMPTS} retry attempts exhausted for "${llmError.code}"`, {
          errorCode: llmError.code,
          totalAttempts: MAX_RETRYABLE_ATTEMPTS,
        })
      }

      throw llmError
    }
  }

  // Should not reach here, but TypeScript needs this
  throw new LLMError('UNKNOWN', 'Erro inesperado no loop de retry', false)
}

/**
 * Inner implementation of callGenAI with parse retry logic.
 * Separated from callGenAI to allow the outer retryable error loop to wrap this cleanly.
 * Handles streaming, response parsing, debug logging, and PARSE_ERROR retry.
 * Non-retryable errors (INVALID_RESPONSE, etc.) and API errors propagate as LLMError.
 */
async function _callGenAIInner<T>(
  provider: LLMProvider,
  modelName: string,
  systemPrompt: string,
  userPrompt: string,
  attachment: ProviderAttachment | undefined,
  attachmentInfo: { sizeKB: number; estimatedTokens: number } | undefined,
  debugContext: DebugContext | undefined
): Promise<{ data: T; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  // Parse retry loop - only for PARSE_ERROR. Retryable errors (RATE_LIMIT,
  // TIMEOUT...) propagam pra fora e ficam por conta do outer retry loop
  // em callGenAI.
  for (let attempt = 1; attempt <= MAX_PARSE_RETRIES; attempt++) {
    try {
      const result = await provider.generateText({
        systemPrompt,
        userPrompt,
        attachment,
        model: modelName,
        debugContext,
      })
      const text = result.text
      const usage = result.usage

      log('INFO', `LLM response received (attempt ${attempt}/${MAX_PARSE_RETRIES})`, {
        provider: provider.name,
        model: result.modelUsed,
        promptTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        responseLength: text.length,
        latencyMs: result.latencyMs,
        estimatedCostUsd: result.estimatedCostUsd,
      })

      // Parse JSON with robust extraction
      const data = parseJSONFromLLM<T>(text)
      if (data === null) {
        const dumpPath = path.join(os.tmpdir(), `iara-parse-error-attempt${attempt}-${Date.now()}.txt`)
        await fs.writeFile(dumpPath, text, 'utf-8')

        log('WARN', `PARSE_ERROR on attempt ${attempt}/${MAX_PARSE_RETRIES}`, {
          rawResponseLength: text.length,
          rawResponsePreview: text.substring(0, 300),
          rawResponseEnd: text.length > 300 ? text.substring(text.length - 200) : undefined,
          dumpPath,
        })

        if (attempt < MAX_PARSE_RETRIES) {
          log('INFO', `Retrying LLM call (attempt ${attempt + 1}/${MAX_PARSE_RETRIES})`)
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
          continue
        }

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

      if (attempt > 1) {
        log('INFO', `LLM call succeeded on attempt ${attempt}/${MAX_PARSE_RETRIES}`)
      }

      // Save debug log if debugContext provided
      if (debugContext) {
        try {
          const { saveLlmLog } = await import('@/lib/firebase/llm-log-admin')
          await saveLlmLog(debugContext.podcastId, {
            component: debugContext.component,
            model: result.modelUsed,
            videoId: debugContext.videoId,
            videoType: debugContext.videoType,
            prompt: { system: systemPrompt, user: userPrompt },
            response: text,
            attachment: attachmentInfo,
            usage,
          })
        } catch (logError) {
          log('WARN', 'Failed to save LLM debug log', {
            error: logError instanceof Error ? logError.message : JSON.stringify(logError),
          })
        }
      }

      return { data, usage }
    } catch (error) {
      if (error instanceof LLMError) {
        throw error
      }
      throw createLLMError(error)
    }
  }

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

    transcriptionFilePath = await createTranscriptionFile(transcription, phase)

    const { data, usage } = await callGenAI<PhaseResponseMap[P]>(
      systemPrompt,
      userPrompt,
      timeout,
      transcriptionFilePath,
      options?.debugContext,
      podcast?.llmConfig?.textModel,
      podcast?.llmConfig?.provider
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
