import type { LLMErrorCode, LLMFailure } from './types'

/**
 * LLM Error class for structured error handling.
 *
 * `cause` preserves the original error so callers can extract structured detail
 * (e.g., Vertex quota metadata for RATE_LIMIT) at log time without losing the
 * user-facing PT-BR message.
 */
export class LLMError extends Error {
  readonly code: LLMErrorCode
  readonly retryable: boolean
  readonly cause?: unknown

  constructor(code: LLMErrorCode, message: string, retryable = false, cause?: unknown) {
    super(message)
    this.name = 'LLMError'
    this.code = code
    this.retryable = retryable
    this.cause = cause
  }

  /**
   * Convert to LLMFailure result type.
   */
  toResult(): LLMFailure {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
      },
    }
  }
}

/**
 * Error messages in Portuguese for user display.
 */
export const LLM_ERROR_MESSAGES: Record<LLMErrorCode, string> = {
  RATE_LIMIT: 'Limite de requisições atingido. Tente novamente em alguns minutos.',
  TIMEOUT: 'A requisição demorou demais. Tente novamente.',
  INVALID_RESPONSE: 'A resposta da IA não está no formato esperado.',
  PARSE_ERROR: 'Erro ao processar a resposta da IA.',
  API_ERROR: 'Erro na API do Gemini. Tente novamente.',
  NETWORK_ERROR: 'Erro de conexão. Verifique sua internet.',
  MISSING_TRANSCRIPT: 'Este vídeo não possui transcrição. Sincronize a transcrição primeiro.',
  MISSING_CONTEXT: 'Contexto do episódio não definido. Preencha o tema e convidados.',
  UNKNOWN: 'Erro desconhecido. Tente novamente.',
}

/**
 * Check if an error code is retryable.
 */
export function isRetryableError(code: LLMErrorCode): boolean {
  return ['RATE_LIMIT', 'TIMEOUT', 'NETWORK_ERROR', 'API_ERROR'].includes(code)
}

/**
 * Create an LLMError from an unknown error.
 * The original error is preserved as `cause` for structured logging downstream.
 */
export function createLLMError(error: unknown): LLMError {
  if (error instanceof LLMError) {
    return error
  }

  if (error instanceof Error) {
    // Check for common error patterns
    const message = error.message.toLowerCase()

    if (message.includes('rate limit') || message.includes('429') || message.includes('resource_exhausted')) {
      return new LLMError('RATE_LIMIT', LLM_ERROR_MESSAGES.RATE_LIMIT, true, error)
    }

    if (message.includes('timeout') || message.includes('timed out')) {
      return new LLMError('TIMEOUT', LLM_ERROR_MESSAGES.TIMEOUT, true, error)
    }

    if (message.includes('network') || message.includes('fetch')) {
      return new LLMError('NETWORK_ERROR', LLM_ERROR_MESSAGES.NETWORK_ERROR, true, error)
    }

    // Note: PARSE_ERROR from our code is thrown explicitly as LLMError in _callGenAIInner
    // and caught by the `instanceof LLMError` check above. SDK errors containing "json" or
    // "parse" (e.g., "Failed to parse response from server") should fall through to API_ERROR
    // (retryable) rather than being misclassified as non-retryable PARSE_ERROR (F10 fix).

    return new LLMError('API_ERROR', error.message, true, error)
  }

  return new LLMError('UNKNOWN', LLM_ERROR_MESSAGES.UNKNOWN, false, error)
}

/**
 * Structured Vertex AI quota information extracted from a RATE_LIMIT error.
 * All fields are best-effort — Vertex returns this info via two channels:
 *  1. Structured `error.details[]` (QuotaFailure, RetryInfo) when the SDK exposes it
 *  2. The free-text `error.message` (always present for 429s)
 * This helper tries both and merges. Null fields mean "not parseable".
 */
export interface QuotaInfo {
  quotaMetric?: string
  quotaId?: string
  modelName?: string
  region?: string
  projectNumber?: string
  retryAfterSeconds?: number
}

export interface RateLimitDetails {
  httpCode?: number
  status?: string
  rawMessage?: string
  quota: QuotaInfo
}

interface RawErrorShape {
  code?: number | string
  status?: string
  message?: string
  error?: { code?: number | string; status?: string; message?: string; details?: unknown[] }
  details?: unknown[]
}

interface QuotaViolation {
  subject?: string
  description?: string
  quotaId?: string
  quotaMetric?: string
}

interface QuotaFailureDetail {
  '@type'?: string
  violations?: QuotaViolation[]
  retryDelay?: string
}

/**
 * Extract Vertex AI quota details from a 429/RESOURCE_EXHAUSTED error.
 * Accepts either the raw thrown error or an LLMError (uses its `cause`).
 *
 * Example output:
 *   {
 *     httpCode: 429,
 *     status: 'RESOURCE_EXHAUSTED',
 *     rawMessage: "Quota exceeded for quota metric '...' ...",
 *     quota: {
 *       quotaMetric: 'aiplatform.googleapis.com/online_prediction_requests_per_minute_per_base_model',
 *       quotaId: 'OnlinePredictionRequestsPerMinutePerRegionPerBaseModel',
 *       modelName: 'gemini-2.0-flash',
 *       region: 'us-central1',
 *       projectNumber: '123456789',
 *       retryAfterSeconds: 60,
 *     }
 *   }
 */
export function extractRateLimitDetails(error: unknown): RateLimitDetails {
  // Unwrap LLMError to its preserved cause
  let raw: unknown = error
  if (error instanceof LLMError && error.cause !== undefined) {
    raw = error.cause
  }

  const empty: RateLimitDetails = { quota: {} }
  if (!raw || typeof raw !== 'object') return empty

  const e = raw as RawErrorShape
  // GenAI SDK ApiError sometimes wraps the payload as { error: { code, status, message, details } }
  const inner: RawErrorShape = e.error ?? e

  const httpCode = typeof inner.code === 'number' ? inner.code : undefined
  const status = typeof inner.status === 'string' ? inner.status : undefined
  const rawMessage = typeof inner.message === 'string' ? inner.message : undefined

  const quota: QuotaInfo = {}

  // Channel 1: structured details[]
  const detailsArr = Array.isArray(inner.details)
    ? inner.details
    : Array.isArray(e.details)
      ? e.details
      : null
  if (detailsArr) {
    for (const d of detailsArr) {
      if (!d || typeof d !== 'object') continue
      const detail = d as QuotaFailureDetail
      const type = detail['@type'] ?? ''
      if (type.includes('QuotaFailure') && Array.isArray(detail.violations) && detail.violations[0]) {
        const v = detail.violations[0]
        if (v.quotaMetric && !quota.quotaMetric) quota.quotaMetric = v.quotaMetric
        if (v.quotaId && !quota.quotaId) quota.quotaId = v.quotaId
      }
      if (type.includes('RetryInfo') && typeof detail.retryDelay === 'string') {
        const m = detail.retryDelay.match(/(\d+(?:\.\d+)?)s/)
        if (m) quota.retryAfterSeconds = Math.round(parseFloat(m[1]))
      }
    }
  }

  // Channel 2: regex on rawMessage (fallback / supplement)
  if (rawMessage) {
    if (!quota.quotaMetric) {
      const m = rawMessage.match(/quota metric ['"]([^'"]+)['"]/i)
      if (m) quota.quotaMetric = m[1]
    }
    if (!quota.quotaId) {
      const m = rawMessage.match(/limit ['"]([^'"]+)['"]/i)
      if (m) quota.quotaId = m[1]
    }
    if (!quota.region) {
      const m = rawMessage.match(/in region ['"]([^'"]+)['"]/i)
      if (m) quota.region = m[1]
    }
    if (!quota.modelName) {
      const m = rawMessage.match(/for base model ['"]([^'"]+)['"]/i)
      if (m) quota.modelName = m[1]
    }
    if (!quota.projectNumber) {
      const m = rawMessage.match(/project_number:(\d+)/i)
      if (m) quota.projectNumber = m[1]
    }
  }

  return { httpCode, status, rawMessage, quota }
}
