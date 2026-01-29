import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { GenerativeModel, VertexAI } from '@google-cloud/vertexai'
import type { Part } from '@google-cloud/vertexai'

import { GCP_REGION, PROJECT_ID, VERTEX_AI_MODEL } from '@/lib/firebase/config'
import { log } from '@/lib/logger'
import type { WizardPhase } from '@/lib/wizard'
import type { Podcast } from '@/types/podcast'
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
 * Vertex AI client singleton.
 * Uses Application Default Credentials (ADC) automatically.
 *
 * - Local: Run `gcloud auth application-default login`
 * - Cloud Run: Automatically uses the service account assigned to the service
 */
let vertexAI: VertexAI | undefined
let generativeModel: GenerativeModel | undefined
let currentModelName: string | undefined

/**
 * Resets the Vertex AI client singleton.
 * Useful for testing or when configuration changes.
 */
export function resetVertexAIClient(): void {
  vertexAI = undefined
  generativeModel = undefined
  currentModelName = undefined
}

/**
 * Gets or initializes the Vertex AI client.
 * Uses Application Default Credentials (ADC) for authentication.
 */
function getVertexAI(): VertexAI {
  if (vertexAI) return vertexAI

  vertexAI = new VertexAI({
    project: PROJECT_ID,
    location: GCP_REGION,
  })

  return vertexAI
}

/**
 * Gets or initializes the generative model.
 * Recreates the model if the configured model name changed.
 */
function getModel(): GenerativeModel {
  const modelName = VERTEX_AI_MODEL || DEFAULT_MODEL

  // Recreate model if config changed
  if (generativeModel && currentModelName === modelName) {
    return generativeModel
  }

  const client = getVertexAI()
  generativeModel = client.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  })
  currentModelName = modelName

  return generativeModel
}

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
 * Read file content and encode as base64 for Vertex AI inlineData.
 *
 * @param filePath - Path to file
 * @returns Base64 encoded content
 */
async function readFileAsBase64(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath)
  return content.toString('base64')
}

/**
 * Call Vertex AI with the given prompts (legacy - without attachment).
 *
 * Note: The Vertex AI SDK doesn't support AbortController/signal for cancellation.
 * We implement timeout using Promise.race with a timeout promise.
 *
 * @deprecated Use callVertexAIWithAttachment for new implementations
 */
async function callVertexAI<T>(
  systemPrompt: string,
  userPrompt: string,
  timeout: number
): Promise<{ data: T; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  return callVertexAIWithAttachment<T>(systemPrompt, userPrompt, timeout, undefined)
}

/**
 * Call Vertex AI with the given prompts and optional file attachment.
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
 * @param timeout - Timeout in milliseconds
 * @param attachmentPath - Optional path to transcription file to attach
 *
 * @see Story 5.4 - Auto-Retry em PARSE_ERROR
 */
async function callVertexAIWithAttachment<T>(
  systemPrompt: string,
  userPrompt: string,
  timeout: number,
  attachmentPath: string | undefined
): Promise<{ data: T; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const model = getModel()

  // Build parts array once - reused across retry attempts
  const parts: Part[] = [{ text: userPrompt }]

  if (attachmentPath) {
    const base64Content = await readFileAsBase64(attachmentPath)
    parts.push({
      inlineData: {
        mimeType: 'text/plain',
        data: base64Content,
      },
    })
    log('INFO', 'Added transcription attachment to request', {
      attachmentPath,
      base64Length: base64Content.length,
    })
  }

  // Retry loop for PARSE_ERROR only
  for (let attempt = 1; attempt <= MAX_PARSE_RETRIES; attempt++) {
    // Track timeout timer for cleanup
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
      // Create timeout promise for race condition (fresh for each attempt)
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new LLMError('TIMEOUT', 'A requisição demorou demais. Tente novamente.', true))
        }, timeout)
      })

      // Race between the API call and timeout
      const result = await Promise.race([
        model.generateContent({
          contents: [{ role: 'user', parts }],
          systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
        }),
        timeoutPromise,
      ])

      // Clear timeout since we got a response
      if (timeoutId) clearTimeout(timeoutId)

      const response = result.response
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text

      if (!text) {
        throw new LLMError('INVALID_RESPONSE', 'Nenhum texto na resposta', false)
      }

      // Parse JSON with robust extraction (handles markdown code blocks, extra text, etc.)
      const data = parseJSONFromLLM<T>(text)
      if (data === null) {
        // Log parse failure with attempt info
        log('WARN', `PARSE_ERROR on attempt ${attempt}/${MAX_PARSE_RETRIES}`, {
          rawResponseLength: text.length,
          rawResponsePreview: text.substring(0, 300),
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
      const usageMetadata = response.usageMetadata
      const usage = {
        promptTokens: usageMetadata?.promptTokenCount || 0,
        completionTokens: usageMetadata?.candidatesTokenCount || 0,
        totalTokens: usageMetadata?.totalTokenCount || 0,
      }

      return { data, usage }
    } catch (error) {
      // Always clear timeout on error to prevent memory leaks
      if (timeoutId) clearTimeout(timeoutId)

      // All errors except internal PARSE_ERROR (from null parse) are thrown immediately
      // Note: PARSE_ERROR from null parse is handled via 'continue' above, not here
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
 * Uses Vertex AI with Application Default Credentials (ADC).
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
    const variables = extractVariables(video, options?.previousPhaseData)
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

    const { data, usage } = await callVertexAIWithAttachment<PhaseResponseMap[P]>(
      systemPrompt,
      userPrompt,
      timeout,
      transcriptionFilePath
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
 * Check if Vertex AI is available.
 * Vertex AI uses ADC, so it's always "configured" if running in GCP
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
