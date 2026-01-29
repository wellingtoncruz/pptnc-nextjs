/**
 * Shared utilities for video field update API routes.
 *
 * Provides consistent error handling and response formatting for
 * routes that update single fields on video documents.
 *
 * @see /api/videos/[videoId]/title
 * @see /api/videos/[videoId]/description
 * @see /api/videos/[videoId]/tags
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { log } from '@/lib/logger'

/**
 * Standard API error response structure.
 */
interface ApiError {
  error: {
    code: string
    message: string
  }
}

/**
 * Creates a standardized error response for video field update APIs.
 */
export function createErrorResponse(
  code: string,
  message: string,
  status: number
): NextResponse<ApiError> {
  return NextResponse.json({ error: { code, message } }, { status })
}

/**
 * Handles common error scenarios for video field updates.
 * Returns appropriate error response based on error type.
 */
export function handleVideoFieldError(
  error: unknown,
  fieldName: string,
  videoId: string
): NextResponse<ApiError> {
  if (error instanceof z.ZodError) {
    log('WARN', `Invalid ${fieldName} data`, { videoId, error })
    return createErrorResponse(
      'VALIDATION_ERROR',
      `${capitalize(fieldName)} invalido(a)`,
      400
    )
  }

  log('ERROR', `Failed to update video ${fieldName}`, { videoId, error })
  return createErrorResponse(
    'INTERNAL_ERROR',
    `Erro ao salvar ${fieldName}`,
    500
  )
}

/**
 * Authentication error response.
 */
export function authExpiredResponse(): NextResponse<ApiError> {
  return createErrorResponse('AUTH_EXPIRED', 'Sessao expirada', 401)
}

/**
 * Not found error response.
 */
export function notFoundResponse(resource: string): NextResponse<ApiError> {
  return createErrorResponse('NOT_FOUND', `${resource} nao encontrado`, 404)
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
