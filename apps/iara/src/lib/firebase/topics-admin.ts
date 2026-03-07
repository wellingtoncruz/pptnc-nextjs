/**
 * Topics Firestore operations using Admin SDK.
 *
 * Reads podcast topics for LLM categorization (Story 20.1).
 * Topics are stored at podcasts/{podcastId}/topics.
 */

import { log } from '@/lib/logger'

import { getAdminDb } from './admin'

/**
 * Topic document structure.
 */
export interface Topic {
  id: string
  name: string
  slug?: string
  episodeCount?: number
}

/**
 * Reads all topic names from the podcast's topics collection.
 *
 * @param podcastId - The podcast ID
 * @returns Array of topic names, sorted alphabetically
 */
export async function listTopicNames(podcastId: string): Promise<string[]> {
  const db = getAdminDb()

  const snapshot = await db
    .collection('podcasts')
    .doc(podcastId)
    .collection('topics')
    .get()

  const names = snapshot.docs
    .map((doc) => {
      const data = doc.data()
      return (data.name as string) || doc.id
    })
    .filter(Boolean)
    .sort()

  log('INFO', 'Topics listed', { podcastId, count: names.length })

  return names
}
