/**
 * LLM module for Gemini API integration.
 *
 * Provides synchronous calls to the Gemini API for each wizard phase.
 */

// Client
export {
  callLLM,
  callLLMQueued,
  cleanupTranscriptionFile,
  createTranscriptionFile,
  isLLMConfigured,
  resetVertexAIClient,
} from './client'

// Queue
export { llmQueue, LLMQueue } from './queue'

// JSON Parsing
export { parseJSONFromLLM, parseJSONFromLLMOrThrow } from './parse-json'

// Errors
export { createLLMError, isRetryableError, LLMError, LLM_ERROR_MESSAGES } from './errors'

// Interpolation
export {
  extractVariables,
  formatDuration,
  formatGuests,
  interpolatePrompt,
  truncateTranscript,
  validateVideoForPhase,
} from './interpolation'

// Prompts
export {
  BASE_SYSTEM_PROMPTS,
  buildPhasePrompt,
  getSystemPrompt,
  getUserPromptTemplate,
  PHASE_CONFIG,
  USER_PROMPT_TEMPLATES,
} from './prompts'
export type { PhaseConfig } from './prompts'

// Types
export type {
  Chapter,
  ComplianceRisk,
  EditingIssue,
  LLMCallOptions,
  LLMContext,
  LLMErrorCode,
  LLMFailure,
  LLMPhaseType,
  LLMResult,
  LLMSuccess,
  Phase1Response,
  Phase2Response,
  Phase3Response,
  Phase4Response,
  Phase5Response,
  Phase5BResponse,
  Phase6Response,
  Phase7Response,
  PhaseResponse,
  PromptVariables,
  VertexAIConfig,
} from './types'

export { PHASE_TIMEOUTS } from './types'
