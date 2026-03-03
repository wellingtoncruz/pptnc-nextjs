/**
 * Fetches multiple video summaries by their IDs.
 *
 * Uses Firestore getAll() for efficient batch reads.
 * Returns results in the same order as the input IDs.
 * Missing or invalid documents are silently skipped.
 *
 * @see Story 18.3 — cached related_videos path
 */

import { VideoSummarySchema } from '@/lib/schemas/video'
import { log } from '@/lib/logger'
import type { VideoSummary } from '@/types/video'

import { getAdminDb } from '@/lib/firebase/admin'

/**
 * Fetches video summaries for a list of video IDs.
 *
 * @param podcastId - The podcast ID
 * @param videoIds - Array of video document IDs
 * @returns Array of validated VideoSummary objects
 */
export async function getVideoSummariesByIds(
  podcastId: string,
  videoIds: string[]
): Promise<VideoSummary[]> {
  if (videoIds.length === 0) return []

  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  const docRefs = videoIds.map(id => videosRef.doc(id))
  const snapshots = await db.getAll(...docRefs)

  const summaries: VideoSummary[] = []
  for (const docSnap of snapshots) {
    if (!docSnap.exists) continue

    const rawData = docSnap.data()
    const parsed = VideoSummarySchema.safeParse({
      ...rawData,
      id: docSnap.id,
      title: rawData?.title ?? 'Sem título',
    })

    if (parsed.success) {
      summaries.push(parsed.data)
    } else {
      log('WARN', 'Skipping invalid video in summaries batch', {
        videoId: docSnap.id,
        errors: parsed.error.issues,
      })
    }
  }

  return summaries
}
