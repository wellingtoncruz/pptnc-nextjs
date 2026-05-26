/**
 * Diagnostic (read-only): breakdown of videos by type and of `reviewedPhases`.
 *
 * Purpose (Epic 25 / TD-7): sanity-check the backfill scope. Answers "how many
 * episodes exist and how many actually carry reviewedPhases, in what shape" —
 * so the migrated count (e.g. 21) can be confirmed against reality rather than
 * assumed.
 *
 * Read-only: never writes. DB chosen by FIRESTORE_DATABASE_ID (default pptnc-stage).
 *
 * Usage:
 *   npx tsx scripts/diagnose-reviewed-phases.ts                         # stage
 *   FIRESTORE_DATABASE_ID=pptnc-prod npx tsx scripts/diagnose-reviewed-phases.ts  # prod (read-only)
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'pptnc-stage'
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'pptnc-stage'
const PODCAST_ID = 'pptnc'

// Valid reviewedPhases entries — legacy numeric {2,3,4} OR migrated kebab ids.
// An element outside this set is a real anomaly (in either pre- or post-backfill state).
const VALID_REVIEW_VALUES: ReadonlySet<unknown> = new Set([2, 3, 4, 'edit-check', 'risk', 'chapters'])

function describeReviewedPhases(v: unknown): string {
  if (v === undefined) return 'absent'
  if (v === null) return 'null'
  if (Array.isArray(v)) {
    if (v.length === 0) return 'empty-array'
    return JSON.stringify(v) // e.g. [2,3,4]
  }
  return `NON-ARRAY(${typeof v}): ${JSON.stringify(v)}`
}

async function main(): Promise<void> {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
  }
  const db = getFirestore(FIRESTORE_DATABASE_ID)
  console.log(`Diagnose reviewedPhases — DB: ${FIRESTORE_DATABASE_ID}\n`)

  const snap = await db.collection('podcasts').doc(PODCAST_ID).collection('videos').get()

  const byType: Record<string, number> = {}
  // reviewedPhases shape breakdown, split by videoType
  const rpByType: Record<string, Record<string, number>> = {}
  // distinct reviewedPhases values → count
  const rpValues: Record<string, number> = {}
  // anomalies: reviewedPhases present but not a clean numeric array, OR values outside {2,3,4}
  const anomalies: Array<{ id: string; videoType: string; reviewedPhases: unknown }> = []

  for (const doc of snap.docs) {
    const data = doc.data()
    const videoType = String(data.videoType ?? 'undefined')
    byType[videoType] = (byType[videoType] ?? 0) + 1

    const rp = data.reviewedPhases
    const shape = describeReviewedPhases(rp)
    rpByType[videoType] = rpByType[videoType] ?? {}
    rpByType[videoType][shape] = (rpByType[videoType][shape] ?? 0) + 1

    if (Array.isArray(rp) && rp.length > 0) {
      rpValues[JSON.stringify(rp)] = (rpValues[JSON.stringify(rp)] ?? 0) + 1
      // anomaly: an element that is neither a legacy review number {2,3,4} nor a
      // valid kebab review id {edit-check,risk,chapters}
      const bad = rp.some((x) => !VALID_REVIEW_VALUES.has(x))
      if (bad) anomalies.push({ id: doc.id, videoType, reviewedPhases: rp })
    } else if (rp !== undefined && rp !== null && !Array.isArray(rp)) {
      // reviewedPhases present but NOT an array → backfill would skip it (potential gap)
      anomalies.push({ id: doc.id, videoType, reviewedPhases: rp })
    }
  }

  console.log(`Total videos: ${snap.size}\n`)
  console.log('By videoType:')
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${n}`)
  }

  console.log('\nreviewedPhases shape by videoType:')
  for (const [t, shapes] of Object.entries(rpByType)) {
    console.log(`  ${t}:`)
    for (const [shape, n] of Object.entries(shapes).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${shape}: ${n}`)
    }
  }

  console.log('\nDistinct non-empty reviewedPhases values:')
  for (const [val, n] of Object.entries(rpValues).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${val}: ${n}`)
  }

  console.log(`\nAnomalies (non-array, or values outside {2,3,4 | edit-check,risk,chapters}): ${anomalies.length}`)
  for (const a of anomalies.slice(0, 50)) {
    console.log(`  ${a.id} [${a.videoType}]: ${JSON.stringify(a.reviewedPhases)}`)
  }
  if (anomalies.length > 50) console.log(`  ... +${anomalies.length - 50} more`)
}

main().catch((err) => {
  console.error('Diagnose failed:', err)
  process.exit(1)
})
