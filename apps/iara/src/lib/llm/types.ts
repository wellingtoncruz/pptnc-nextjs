import type { WizardPhase } from '@/lib/wizard'
import type { Video } from '@/types/video'

/**
 * LLM phase type - maps wizard phases to their LLM behavior.
 *
 * - immutable: Phases 1-4, run once and cannot be reprocessed
 * - reprocessable: Phases 5-7, can be re-run with additional prompts
 * - final: Phase 8, no LLM call (YouTube API only)
 */
export type LLMPhaseType = 'immutable' | 'reprocessable' | 'final'

/**
 * Response schema for each phase.
 * Each phase returns different structured data.
 */
export interface Phase1Response {
  critique: string
  highlights: string[]
  suggestions: string[]
}

export interface Phase2Response {
  hasIssues: boolean
  issues: Array<{
    timestamp: number
    issue: string
    severity: 'minor' | 'major'
  }>
}

export interface Phase3Response {
  status: 'ok' | 'warning'
  items: Array<{
    risk: string
    argument: string
    timestamp: number
  }>
}

export interface Phase4Response {
  chapters: Array<{
    title: string
    timestamp: number
  }>
}

export interface Phase5Response {
  titles: string[] // 5 title suggestions
}

export interface Phase6Response {
  description: string
}

export interface Phase7Response {
  tags: string[]
}

/**
 * Union type for all phase responses.
 */
export type PhaseResponse =
  | Phase1Response
  | Phase2Response
  | Phase3Response
  | Phase4Response
  | Phase5Response
  | Phase6Response
  | Phase7Response

/**
 * LLM call options.
 */
export interface LLMCallOptions {
  /** Override the default prompt with custom text */
  promptOverride?: string
  /** Additional context to append to the prompt */
  additionalContext?: string
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number
  /** Previous phase data for SEO chain */
  previousPhaseData?: Record<string, unknown>
}

/**
 * LLM call result - success case.
 */
export interface LLMSuccess<T = PhaseResponse> {
  success: true
  data: T
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * LLM call result - error case.
 */
export interface LLMFailure {
  success: false
  error: {
    code: LLMErrorCode
    message: string
    retryable: boolean
  }
}

/**
 * LLM call result union type.
 */
export type LLMResult<T = PhaseResponse> = LLMSuccess<T> | LLMFailure

/**
 * Error codes for LLM failures.
 */
export type LLMErrorCode =
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'PARSE_ERROR'
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'MISSING_TRANSCRIPT'
  | 'MISSING_CONTEXT'
  | 'UNKNOWN'

/**
 * Prompt variables available for interpolation.
 */
export interface PromptVariables {
  /** Original video title from YouTube */
  title: string
  /** SRT transcript content */
  transcript: string
  /** Formatted duration (e.g., "1h 23m 45s") */
  duration: string
  /** Episode theme (for episodes only) */
  theme: string
  /** Formatted guest list */
  guests: string
  /** JSON string of previous phase data */
  previousPhaseData: string
  /** Video type (episode, cut, reel) */
  videoType: string
}

/**
 * Context needed for LLM calls.
 */
export interface LLMContext {
  video: Video
  phase: WizardPhase
  podcastPrompts?: {
    description: string
    expectedOutput: string
  }
  options?: LLMCallOptions
}

/**
 * Vertex AI configuration.
 * Uses Application Default Credentials (ADC) for authentication.
 *
 * Configuration values are in src/lib/firebase/config.ts:
 * - PROJECT_ID: GCP project
 * - GCP_REGION: Vertex AI location
 * - VERTEX_AI_MODEL: Model to use
 */
export interface VertexAIConfig {
  project: string
  location: string
  model: string
  maxOutputTokens: number
  temperature: number
}

/**
 * Timeout per phase (in ms).
 * Longer timeouts for phases with more complex processing.
 */
export const PHASE_TIMEOUTS: Record<WizardPhase, number> = {
  1: 60000, // Critique - full video analysis
  2: 45000, // Editing check - SRT analysis
  3: 45000, // Compliance - risk analysis
  4: 30000, // Chapters - timestamp extraction
  5: 30000, // Titles - 5 suggestions
  6: 45000, // Description - SEO optimized
  7: 30000, // Tags - keyword extraction
  8: 0,     // No LLM call
}
