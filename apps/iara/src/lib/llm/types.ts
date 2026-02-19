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

/**
 * Editing Issue type for Phase 2.
 *
 * @see processamento_video.md - Fase 2
 */
export interface EditingIssue {
  /** Timestamp in format "HH:MM:SS" or "MM:SS" */
  timestamp: string
  /** Description of the editing issue */
  description: string
}

/**
 * Phase 2 response - Editing check.
 *
 * Identifies potential editing issues in the video.
 * Array is empty if no issues found (success case).
 *
 * @see processamento_video.md - Fase 2
 */
export interface Phase2Response {
  /** Whether issues were found */
  hasIssues: boolean
  /** List of editing issues with timestamps */
  issues: EditingIssue[]
}

/**
 * Compliance Risk type for Phase 3.
 *
 * @see processamento_video.md - Fase 3
 */
export interface ComplianceRisk {
  /** Timestamp in format "HH:MM:SS" or "MM:SS" */
  timestamp: string
  /** Type of risk: brand_mention, sensitive_language, unverified_claim, legal_risk, medical_claim, financial_advice, competitor_mention, other */
  risk: string
  /** Detailed description of the risk */
  description: string
}

/**
 * Phase 3 response - Risk and Compliance check.
 *
 * Identifies potential compliance risks in the video.
 * Array is empty if no risks found (success case).
 *
 * @see processamento_video.md - Fase 3
 */
export interface Phase3Response {
  /** Whether risks were found */
  hasRisks: boolean
  /** List of compliance risks with timestamps */
  risks: ComplianceRisk[]
}

/**
 * Chapter type for Phase 4.
 *
 * @see processamento_video.md - Fase 4
 */
export interface Chapter {
  /** Timestamp in format "HH:MM:SS" or "MM:SS" - first chapter always starts at "00:00" */
  timestamp: string
  /** Chapter title (max 50 characters) */
  title: string
}

/**
 * Phase 4 response - Chapters generation.
 *
 * Suggests chapter divisions by topic.
 * First chapter must always start at "00:00".
 *
 * @see processamento_video.md - Fase 4
 */
export interface Phase4Response {
  /** List of chapters ordered by timestamp */
  chapters: Chapter[]
}

export interface Phase5Response {
  titles: string[] // 5 title suggestions
}

/**
 * Phase 5B response - Short title suggestions for thumbnails (cut only).
 *
 * Short titles are used for YouTube thumbnails where space is limited.
 * Should be more impactful and concise than full titles.
 */
export interface Phase5BResponse {
  shortTitles: string[] // 5 short title suggestions for thumbnails
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
  | Phase5BResponse
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
  /** Podcast host/presenter name */
  hostName: string
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
 * Maximum number of retry attempts for PARSE_ERROR.
 * Only PARSE_ERROR triggers retry - other errors (TIMEOUT, RATE_LIMIT, etc.) fail immediately.
 *
 * @see Story 5.4 - Auto-Retry em PARSE_ERROR
 */
export const MAX_PARSE_RETRIES = 3

/**
 * Delay between retry attempts in milliseconds.
 * Gives the LLM a brief moment to "stabilize" before retrying.
 *
 * @see Story 5.4 - Auto-Retry em PARSE_ERROR
 */
export const RETRY_DELAY_MS = 1000

/**
 * Timeout per phase (in ms).
 * Phases 1-4 use SRT transcription as input (can be 100K+ tokens for long episodes).
 * Gemini 2.5 Flash thinking tokens increase processing time for large inputs.
 */
export const PHASE_TIMEOUTS: Record<WizardPhase, number> = {
  1: 0, // No timeout - let model work (thinking tokens can be slow for large SRT)
  2: 0, // No timeout
  3: 0, // No timeout
  4: 0, // No timeout
  5: 120000, // Titles (2 min)
  6: 120000, // Description (2 min)
  7: 120000, // Tags (2 min)
  8: 0,      // No LLM call
}
