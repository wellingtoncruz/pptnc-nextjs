import type { LLMErrorCode, LLMFailure } from './types'

/**
 * LLM Error class for structured error handling.
 */
export class LLMError extends Error {
  readonly code: LLMErrorCode
  readonly retryable: boolean

  constructor(code: LLMErrorCode, message: string, retryable = false) {
    super(message)
    this.name = 'LLMError'
    this.code = code
    this.retryable = retryable
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
 */
export function createLLMError(error: unknown): LLMError {
  if (error instanceof LLMError) {
    return error
  }

  if (error instanceof Error) {
    // Check for common error patterns
    const message = error.message.toLowerCase()

    if (message.includes('rate limit') || message.includes('429')) {
      return new LLMError('RATE_LIMIT', LLM_ERROR_MESSAGES.RATE_LIMIT, true)
    }

    if (message.includes('timeout') || message.includes('timed out')) {
      return new LLMError('TIMEOUT', LLM_ERROR_MESSAGES.TIMEOUT, true)
    }

    if (message.includes('network') || message.includes('fetch')) {
      return new LLMError('NETWORK_ERROR', LLM_ERROR_MESSAGES.NETWORK_ERROR, true)
    }

    // Note: PARSE_ERROR from our code is thrown explicitly as LLMError in _callGenAIInner
    // and caught by the `instanceof LLMError` check above. SDK errors containing "json" or
    // "parse" (e.g., "Failed to parse response from server") should fall through to API_ERROR
    // (retryable) rather than being misclassified as non-retryable PARSE_ERROR (F10 fix).

    return new LLMError('API_ERROR', error.message, true)
  }

  return new LLMError('UNKNOWN', LLM_ERROR_MESSAGES.UNKNOWN, false)
}
