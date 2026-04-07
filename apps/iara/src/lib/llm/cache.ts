import { createHash } from 'crypto'

import { log } from '@/lib/logger'

import { getAI } from './client'

/**
 * Minimum token count for Gemini Context Caching.
 * Content below this threshold cannot be cached — falls back to inlineData.
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview
 */
const MIN_CACHE_TOKENS = 32768

/**
 * TTL for cached content: 48 hours in seconds.
 * SRT/TXT transcriptions are immutable once created, so the cache
 * is valid for as long as the API allows. Max TTL prevents stale
 * caches from accumulating indefinitely.
 */
const CACHE_TTL = '172800s'

/**
 * In-memory cache of displayName → cacheName mappings.
 *
 * Fixes:
 * - F5: Avoids O(n) scan of ai.caches.list() on every call
 * - F4: Prevents duplicate cache creation from concurrent calls
 *
 * Entries are valid for the server process lifetime. On restart,
 * the Map is empty and caches are re-discovered via list() on first access.
 */
const cacheNameMap = new Map<string, string>()

/**
 * Format of the transcription content being cached.
 * Each format gets its own cache per video — they are NOT shared.
 */
export type CacheFormat = 'srt' | 'txt'

/**
 * Compute a short hash of content for cache key uniqueness.
 * Ensures cache invalidation when transcription is re-synced (F12 fix)
 * and model mismatch is detected (F3 fix).
 */
function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 8)
}

/**
 * Extract the short model identifier from a full model name.
 * E.g., "gemini-2.5-flash" → "g25f", "gemini-2.5-pro" → "g25p"
 * Used in displayName to ensure cache-model affinity (F3 fix).
 */
function shortModelId(modelName: string): string {
  // Use last 8 chars of hash — short but unique enough for model differentiation
  return createHash('md5').update(modelName).digest('hex').substring(0, 6)
}

/**
 * Build the cache displayName that serves as the lookup key.
 * Format: `iara-{videoId}-{format}-{modelHash}-{contentHash}`
 *
 * Includes model hash (F3) and content hash (F12) to ensure:
 * - Model changes produce a new cache (no 400 from mismatched model)
 * - Transcription re-syncs produce a new cache (no stale results)
 */
export function buildCacheDisplayName(
  videoId: string,
  format: CacheFormat,
  modelName: string,
  content: string
): string {
  const modelHash = shortModelId(modelName)
  const contentHash = computeContentHash(content)
  return `iara-${videoId}-${format}-${modelHash}-${contentHash}`
}

/**
 * Get or create a Gemini context cache for a video's transcription.
 *
 * Uses a get-or-create pattern:
 * 1. If content is too small (< 32K tokens), returns null (fallback to inlineData)
 * 2. Checks in-memory Map for O(1) lookup (F5 fix)
 * 3. Falls back to ai.caches.list() scan if not in Map
 * 4. If not found, creates new cache with 48h TTL
 *
 * NEVER throws — returns null on any failure for transparent fallback.
 * Caches are isolated per videoId + format + model + content hash.
 *
 * @param videoId - The video ID (used in displayName for isolation)
 * @param format - The transcription format ('srt' or 'txt')
 * @param content - The raw transcription content
 * @param modelName - The Gemini model name (cache is model-specific)
 * @returns Cache resource name (string) or null if caching was skipped/failed
 */
export async function getOrCreateCache(
  videoId: string,
  format: CacheFormat,
  content: string,
  modelName: string
): Promise<string | null> {
  try {
    // Estimate token count: ~4 bytes per token for Portuguese text
    const estimatedTokens = Math.round(Buffer.byteLength(content, 'utf-8') / 4)

    if (estimatedTokens < MIN_CACHE_TOKENS) {
      log('INFO', 'Skipping cache — content below minimum token threshold', {
        videoId,
        format,
        estimatedTokens,
        minRequired: MIN_CACHE_TOKENS,
      })
      return null
    }

    const displayName = buildCacheDisplayName(videoId, format, modelName, content)

    // O(1) lookup in in-memory Map (F5 fix)
    const cached = cacheNameMap.get(displayName)
    if (cached) {
      log('INFO', 'Reusing cache from in-memory Map', {
        videoId,
        format,
        cacheName: cached,
        displayName,
      })
      return cached
    }

    const ai = getAI()

    // Fallback: scan API list for cache that was created in a previous server process
    const existingCache = await findCacheByDisplayName(ai, displayName)
    if (existingCache) {
      cacheNameMap.set(displayName, existingCache)
      log('INFO', 'Reusing existing cache from API', {
        videoId,
        format,
        cacheName: existingCache,
        displayName,
      })
      return existingCache
    }

    // Create new cache.
    // Note: Content is sent as text/plain for both SRT and TXT (F11).
    // Gemini processes text content regardless of MIME type, and the original
    // inlineData path also uses text/plain — keeping consistent.
    const base64Content = Buffer.from(content, 'utf-8').toString('base64')

    // Note: Cache is created WITHOUT systemInstruction (F6).
    // The systemInstruction is passed at generation time in callGenAI, which is valid
    // when the cache does not include one. This allows different system prompts per phase
    // while reusing the same cached transcription.
    const cache = await ai.caches.create({
      model: modelName,
      config: {
        displayName,
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: 'text/plain',
                  data: base64Content,
                },
              },
            ],
            role: 'user',
          },
        ],
        ttl: CACHE_TTL,
      },
    })

    const cacheName = cache.name ?? null
    if (cacheName) {
      cacheNameMap.set(displayName, cacheName)
    }

    log('INFO', 'Created new cache', {
      videoId,
      format,
      cacheName,
      displayName,
      estimatedTokens,
      ttl: CACHE_TTL,
    })

    return cacheName
  } catch (error) {
    // NEVER propagate errors — fallback to inlineData transparently
    log('WARN', 'Cache operation failed, falling back to inlineData', {
      videoId,
      format,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Find an existing cache by displayName via API list scan.
 * Only called when the in-memory Map doesn't have the entry
 * (e.g., after server restart).
 *
 * @returns Cache resource name if found, null otherwise
 */
async function findCacheByDisplayName(
  ai: ReturnType<typeof getAI>,
  displayName: string
): Promise<string | null> {
  try {
    const caches = await ai.caches.list()
    for await (const cache of caches) {
      if (cache.displayName === displayName && cache.name) {
        return cache.name
      }
    }
    return null
  } catch (error) {
    // If listing fails, treat as cache miss — will create new
    log('WARN', 'Failed to list caches, treating as cache miss', {
      displayName,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Clear the in-memory cache name Map.
 * Useful for testing.
 */
export function clearCacheNameMap(): void {
  cacheNameMap.clear()
}
