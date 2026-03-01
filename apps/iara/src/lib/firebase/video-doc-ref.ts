import { getAdminDb } from './admin'
import { PODCAST_ID } from './config'

/**
 * Helper to get the video document reference.
 *
 * Path: `podcasts/{podcastId}/videos/{videoId}`
 */
export function getVideoDocRef(videoId: string) {
  const db = getAdminDb()
  return db
    .collection('podcasts').doc(PODCAST_ID)
    .collection('videos').doc(videoId)
}
