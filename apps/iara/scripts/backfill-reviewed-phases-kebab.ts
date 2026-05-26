/**
 * Migration Script: Backfill `reviewedPhases` from legacy numeric to semantic
 * kebab IDs (TD-7 / Epic 25, Story 25.7d).
 *
 * The wizard migrated `reviewedPhases` storage from numeric phase numbers
 * (2, 3, 4) to semantic kebab ids ('edit-check', 'risk', 'chapters'). This
 * script converts the existing video documents so the deployed (post-25.7c)
 * code reads them correctly.
 *
 * Mapping: 1→critique, 2→edit-check, 3→risk, 4→chapters, 5→title, 6→description,
 * 7→tags, 8→publish. In practice only 2/3/4 occur (the review phases), but the
 * full set is handled defensively.
 *
 * Features:
 * - Idempotent: re-running is a no-op (already-kebab arrays are skipped).
 * - Dry-run by default; pass `--execute` to write.
 *
 * ⚠️ PREREQUISITE (gate): BACK UP the TARGET database BEFORE `--execute`. The
 * production data lives in pptnc-prod (now an exclusive prod DB); select it via
 * FIRESTORE_DATABASE_ID. Run inside the coordinated deploy window (see
 * epic-25-td7-full-migration-plan.md §5/§6).
 *
 * Usage (DB chosen by FIRESTORE_DATABASE_ID env; pptnc-prod = production):
 *   FIRESTORE_DATABASE_ID=pptnc-prod npx tsx scripts/backfill-reviewed-phases-kebab.ts            # dry-run (prod)
 *   FIRESTORE_DATABASE_ID=pptnc-prod npx tsx scripts/backfill-reviewed-phases-kebab.ts --execute  # writes (prod, after backup)
 *   npx tsx scripts/backfill-reviewed-phases-kebab.ts                                              # dry-run (stage, default)
 *
 * Prerequisites: `gcloud auth application-default login`; access to the DB.
 *
 * @see epic-25-td7-full-migration-plan.md §6
 */

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'pptnc-stage'
// pptnc-prod is the exclusive production Firestore DB (named DB in the same
// pptnc-stage GCP project). Select the target via FIRESTORE_DATABASE_ID.
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'pptnc-stage'
const PODCAST_ID = 'pptnc'

/**
 * Legacy numeric phase → semantic kebab id. Inlined here on purpose so the
 * backfill does not depend on the runtime mapper (removed in Story 25.7e).
 */
const LEGACY_NUM_TO_KEBAB: Record<number, string> = {
  1: 'critique',
  2: 'edit-check',
  3: 'risk',
  4: 'chapters',
  5: 'title',
  6: 'description',
  7: 'tags',
  8: 'publish',
}

/**
 * Convert a `reviewedPhases` array (possibly legacy numeric) to kebab ids.
 * Idempotent: string entries (already migrated) pass through unchanged, so
 * `changed` is false when there is nothing to do.
 *
 * Exported for testing.
 */
export function migrateReviewedPhases(
  arr: readonly unknown[]
): { result: string[]; changed: boolean } {
  let changed = false
  const result = arr.map((v) => {
    if (typeof v === 'number') {
      const kebab = LEGACY_NUM_TO_KEBAB[v]
      if (!kebab) {
        throw new Error(`Unknown legacy reviewedPhases number: ${v}`)
      }
      changed = true
      return kebab
    }
    return String(v)
  })
  return { result, changed }
}

interface BackfillReport {
  totalVideos: number
  migrated: number
  skipped: number
  changes: Array<{ videoId: string; from: unknown[]; to: string[] }>
}

/**
 * Iterate every video and (optionally) write migrated `reviewedPhases`.
 * Exported for testing; `main()` calls it with a real Firestore instance.
 */
export async function backfillReviewedPhases(
  db: Firestore,
  options: { execute: boolean }
): Promise<BackfillReport> {
  const snap = await db.collection('podcasts').doc(PODCAST_ID).collection('videos').get()
  const report: BackfillReport = { totalVideos: snap.size, migrated: 0, skipped: 0, changes: [] }

  for (const doc of snap.docs) {
    const reviewedPhases = doc.data().reviewedPhases
    if (!Array.isArray(reviewedPhases) || reviewedPhases.length === 0) {
      report.skipped++
      continue
    }

    const { result, changed } = migrateReviewedPhases(reviewedPhases)
    if (!changed) {
      report.skipped++
      continue
    }

    report.migrated++
    report.changes.push({ videoId: doc.id, from: reviewedPhases, to: result })
    if (options.execute) {
      await doc.ref.update({ reviewedPhases: result })
    }
  }

  return report
}

function initFirebase(): Firestore {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
  }
  return getFirestore(FIRESTORE_DATABASE_ID)
}

async function main(): Promise<void> {
  const execute = process.argv.slice(2).includes('--execute')
  console.log(`reviewedPhases backfill — ${execute ? 'EXECUTE (writing)' : 'DRY-RUN (no writes)'}`)
  if (!execute) {
    console.log('⚠️  Dry-run. Pass --execute to write. BACK UP THE DB FIRST (shared dev/prod).')
  }

  const db = initFirebase()
  const report = await backfillReviewedPhases(db, { execute })

  console.log(`\nTotal videos: ${report.totalVideos}`)
  console.log(`Migrated: ${report.migrated}${execute ? '' : ' (would migrate)'}`)
  console.log(`Skipped (no change): ${report.skipped}`)
  for (const c of report.changes) {
    console.log(`  ${c.videoId}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`)
  }
  if (!execute && report.migrated > 0) {
    console.log('\nRun with --execute to apply (only after the DB backup).')
  }
}

if (!process.env.VITEST) {
  main().catch((err) => {
    console.error('Backfill failed:', err)
    process.exit(1)
  })
}
