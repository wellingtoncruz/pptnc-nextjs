/**
 * Adapter `iara-counts` — episode/cut/short counts from the videos collection
 * (Firestore aggregate count(), no document reads).
 *
 * ⚠️ PROVISIONAL COUNTING RULE (2026-08-26): counts every video by
 * `videoType`, standalone included, regardless of status. Measured against
 * the design numbers (234/1.170/1.872) NEITHER all-docs (prod: 247/1.063/
 * 1.523) NOR sent-only (219/950/1.442) matches — the design's numbers come
 * from somewhere else (Wellington to define the source of truth; pending
 * product decision registered in the story).
 */
import { getAdminDb } from '@/lib/firebase/admin'
import { PODCAST_ID } from '@/lib/firebase/config'

import type { CollectorAdapter, SectionWrite } from './runner'

async function countByType(videoType: 'episode' | 'cut' | 'reel'): Promise<number> {
  const db = getAdminDb()
  const snapshot = await db
    .collection('podcasts')
    .doc(PODCAST_ID)
    .collection('videos')
    .where('videoType', '==', videoType)
    .count()
    .get()
  return snapshot.data().count
}

export const iaraCountsAdapter: CollectorAdapter = {
  name: 'iara-counts',
  async collect(): Promise<SectionWrite[]> {
    const [episodes, cuts, shorts] = await Promise.all([
      countByType('episode'),
      countByType('cut'),
      countByType('reel'),
    ])
    return [{ section: 'stats', partial: { episodes, cuts, shorts } }]
  },
}
