/**
 * JSON parsing utilities for LLM responses.
 *
 * LLMs sometimes return JSON wrapped in markdown code blocks or with
 * extra text. This module provides robust parsing that handles these cases.
 */

import { log } from '@/lib/logger'

/**
 * Escapes raw control characters (U+0000–U+001F) found INSIDE JSON strings.
 *
 * `claude-sonnet-5` separa parágrafos com quebra de linha crua dentro do valor
 * (`"description": "p1\n\np2"` com newline literal), o que o JSON estrito
 * rejeita. Em PROD (08–11/10/2026) isso derrubou 13 jobs de descrição com o
 * texto inteiro e correto. Fora de strings nada muda, então JSON válido passa
 * intacto.
 */
export function escapeControlCharsInStrings(text: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (const ch of text) {
    if (!inString) {
      if (ch === '"') inString = true
      out += ch
      continue
    }
    if (escaped) {
      escaped = false
      out += ch
      continue
    }
    if (ch === '\\') {
      escaped = true
      out += ch
      continue
    }
    if (ch === '"') {
      inString = false
      out += ch
      continue
    }
    const code = ch.charCodeAt(0)
    if (code >= 0x20) out += ch
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else out += `\\u${code.toString(16).padStart(4, '0')}`
  }
  return out
}

function parseLenient<T>(json: string): T {
  try {
    return JSON.parse(json) as T
  } catch (error) {
    const repaired = escapeControlCharsInStrings(json)
    if (repaired === json) throw error
    return JSON.parse(repaired) as T
  }
}

/**
 * Attempts to parse JSON from an LLM response.
 *
 * Tries multiple strategies in order:
 * 1. Direct JSON.parse (fastest path)
 * 2. Extract from <json_response>...</json_response> tags (hardened prompts)
 * 3. Extract from markdown code blocks (```json ... ```)
 * 4. Find JSON object/array in the text
 *
 * Each strategy retries once with raw control characters escaped inside
 * strings (see `escapeControlCharsInStrings`).
 *
 * @param text - Raw text from LLM response
 * @returns Parsed JSON object or null if parsing fails
 */
export function parseJSONFromLLM<T>(text: string): T | null {
  // Strategy 1: Direct parse (most common case with responseMimeType: 'application/json')
  try {
    return parseLenient<T>(text)
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Extract from <json_response> tags (hardened prompts for phases 2, 3)
  // This is the preferred format for complex responses
  const jsonResponseMatch = text.match(/<json_response>\s*([\s\S]*?)\s*<\/json_response>/)
  if (jsonResponseMatch) {
    try {
      return parseLenient<T>(jsonResponseMatch[1].trim())
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 3a: STRIP the outer markdown fence rather than matching its
  // contents. Lazy match (`[\s\S]*?`) breaks the moment the JSON body itself
  // contains a fenced code block (LLMs love to nest one inside `report` for
  // newsletters/social posts). Stripping the very first and very last fence
  // sidesteps the issue and survives any number of internal backticks.
  const trimmed = text.trim()
  if (trimmed.startsWith('```')) {
    const stripped = trimmed
      .replace(/^```(?:json)?\s*\n?/, '')
      .replace(/\n?\s*```\s*$/, '')
      .trim()
    if (stripped !== trimmed) {
      try {
        return parseLenient<T>(stripped)
      } catch {
        // Continue to next strategy
      }
    }
  }

  // Strategy 3b: Legacy fence-matched extraction (kept for backward compat
  // with responses that have content before/after the fence).
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    try {
      return parseLenient<T>(codeBlockMatch[1].trim())
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 4: Find JSON object or array in text
  // Look for first { or [ and match to closing } or ]
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (jsonMatch) {
    try {
      return parseLenient<T>(jsonMatch[1])
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
