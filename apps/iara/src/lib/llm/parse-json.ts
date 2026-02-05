/**
 * JSON parsing utilities for LLM responses.
 *
 * LLMs sometimes return JSON wrapped in markdown code blocks or with
 * extra text. This module provides robust parsing that handles these cases.
 */

import { log } from '@/lib/logger'

/**
 * Attempts to parse JSON from an LLM response.
 *
 * Tries multiple strategies in order:
 * 1. Direct JSON.parse (fastest path)
 * 2. Extract from <json_response>...</json_response> tags (hardened prompts)
 * 3. Extract from markdown code blocks (```json ... ```)
 * 4. Find JSON object/array in the text
 *
 * @param text - Raw text from LLM response
 * @returns Parsed JSON object or null if parsing fails
 */
export function parseJSONFromLLM<T>(text: string): T | null {
  // Strategy 1: Direct parse (most common case with responseMimeType: 'application/json')
  try {
    return JSON.parse(text) as T
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Extract from <json_response> tags (hardened prompts for phases 2, 3)
  // This is the preferred format for complex responses
  const jsonResponseMatch = text.match(/<json_response>\s*([\s\S]*?)\s*<\/json_response>/)
  if (jsonResponseMatch) {
    try {
      return JSON.parse(jsonResponseMatch[1].trim()) as T
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 3: Extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as T
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 4: Find JSON object or array in text
  // Look for first { or [ and match to closing } or ]
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]) as T
    } catch {
      // All strategies failed
    }
  }

  return null
}

/**
 * Parses JSON from LLM response with logging on failure.
 *
 * @param text - Raw text from LLM response
 * @param context - Context for logging (e.g., phase number)
 * @returns Parsed JSON object
 * @throws Error if parsing fails
 */
export function parseJSONFromLLMOrThrow<T>(text: string, context?: Record<string, unknown>): T {
  const result = parseJSONFromLLM<T>(text)

  if (result === null) {
    // Log the raw response for debugging
    log('ERROR', 'Failed to parse JSON from LLM response', {
      ...context,
      rawResponseLength: text.length,
      rawResponsePreview: text.substring(0, 500),
      rawResponseEnd: text.length > 500 ? text.substring(text.length - 200) : undefined,
    })

    throw new Error('Failed to parse JSON from LLM response')
  }

  return result
}
