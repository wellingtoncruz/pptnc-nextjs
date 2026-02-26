/**
 * LLM Log Admin — Debug log CRUD for LLM calls.
 *
 * - `saveLlmLog()`: Writes a debug log entry to `podcasts/{podcastId}/llmLogs`
 * - `getLlmLogs()`: Reads logs with orderBy createdAt desc and limit
 *
 * @see LlmLogCreateSchema, LlmLogSchema for validation rules
 */
import { FieldValue } from 'firebase-admin/firestore'

import { log } from '@/lib/logger'
import { LlmLogCreateSchema } from '@/lib/schemas/llm-log'
import type { LlmLogCreate } from '@/types/llm-log'

import { getAdminDb } from './admin'
import { PODCAST_ID } from './config'

/**
 * Helper to get the llmLogs subcollection reference.
 *
 * Path: `podcasts/{podcastId}/llmLogs`
 */
function getLlmLogsCollection(podcastId?: string) {
  const db = getAdminDb()
  return db
    .collection('podcasts').doc(podcastId ?? PODCAST_ID)
    .collection('llmLogs')
}

/**
 * Saves an LLM debug log entry to Firestore.
 *
 * @param podcastId - The podcast document ID
 * @param data - The log data to persist
 */
export async function saveLlmLog(podcastId: string, data: LlmLogCreate): Promise<void> {
  const validated = LlmLogCreateSchema.parse(data)

  const docRef = getLlmLogsCollection(podcastId).doc()

  await docRef.set({
    ...validated,
    createdAt: FieldValue.serverTimestamp(),
  })

  log('INFO', 'LLM debug log saved', {
    component: validated.component,
    videoId: validated.videoId,
    model: validated.model,
  })
}

/**
 * Options for querying LLM logs.
 */
interface GetLlmLogsOptions {
  limit?: number
  startAfter?: FirebaseFirestore.DocumentSnapshot
}

/**
 * Gets LLM debug logs ordered by createdAt desc.
 *
 * @param podcastId - The podcast document ID
 * @param options - Query options (limit, cursor)
 * @returns Array of log entries with id and serialized createdAt
 */
export async function getLlmLogs(
  podcastId: string,
  options: GetLlmLogsOptions = {}
): Promise<{ logs: Array<Record<string, unknown>>; lastDoc: FirebaseFirestore.DocumentSnapshot | null }> {
  const { limit = 100, startAfter } = options

  let query = getLlmLogsCollection(podcastId)
    .orderBy('createdAt', 'desc')
    .limit(limit)

  if (startAfter) {
    query = query.startAfter(startAfter)
  }

  const snapshot = await query.get()

  if (snapshot.empty) {
    log('INFO', 'No LLM logs found', { podcastId })
    return { logs: [], lastDoc: null }
  }

  const logs = snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    }
  })

  const lastDoc = snapshot.docs[snapshot.docs.length - 1] ?? null

  log('INFO', 'LLM logs fetched', { podcastId, count: logs.length })
  return { logs, lastDoc }
}
