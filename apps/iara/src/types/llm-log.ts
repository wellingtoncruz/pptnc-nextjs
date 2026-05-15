import type { z } from 'zod'

import type { LlmLogCreateSchema, LlmLogSchema } from '@/lib/schemas/llm-log'

/**
 * Full LLM log entry (from Firestore).
 */
export type LlmLog = z.infer<typeof LlmLogSchema>

/**
 * Input for creating a new LLM log entry.
 */
export type LlmLogCreate = z.infer<typeof LlmLogCreateSchema>

/**
 * LLM log entry as returned by the API (createdAt serialized to ISO string or null).
 */
export interface LlmLogEntry {
  id: string
  component: string
  model: string
  videoId: string
  videoType: 'episode' | 'cut' | 'reel'
  prompt: { system: string; user: string }
  response: string
  createdAt: string | null
  attachment?: { sizeKB: number; estimatedTokens: number }
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  provider: 'gemini' | 'claude'
  estimatedCostUsd: number
  cacheHit?: boolean
}

/**
 * Debug context passed to callGenAI for conditional logging.
 */
export interface DebugContext {
  component: string
  videoId: string
  videoType: 'episode' | 'cut' | 'reel'
  podcastId: string
}
