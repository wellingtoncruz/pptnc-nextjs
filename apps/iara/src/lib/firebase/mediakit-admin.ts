/**
 * Mediakit Admin — the two doors of the mediakit contract (Epic 30).
 *
 * - `readMediakit()`: full contract read — the PDF generator's ONLY input.
 * - `writeMediakitSection()`: merge write scoped to one section — how every
 *   collector adapter lands its fields without touching anyone else's.
 *
 * Docs live at `podcasts/{PODCAST_ID}/mediakit/{stats|audience|series}`.
 * Every write stamps `updatedAt` + `sources.<source>` for staleness tracking.
 */
import { FieldValue } from 'firebase-admin/firestore'

import { log } from '@/lib/logger'
import {
  MediakitAudienceSchema,
  MediakitAudienceWriteSchema,
  MediakitSeriesSchema,
  MediakitSeriesWriteSchema,
  MediakitStatsSchema,
  MediakitStatsWriteSchema,
  type MediakitSectionId,
} from '@/lib/schemas/mediakit'
import type {
  MediakitAudienceWrite,
  MediakitData,
  MediakitSeriesWrite,
  MediakitStatsWrite,
} from '@/types/mediakit'

import { getAdminDb } from './admin'
import { PODCAST_ID } from './config'

const READ_SCHEMAS = {
  stats: MediakitStatsSchema,
  audience: MediakitAudienceSchema,
  series: MediakitSeriesSchema,
} as const

const WRITE_SCHEMAS = {
  stats: MediakitStatsWriteSchema,
  audience: MediakitAudienceWriteSchema,
  series: MediakitSeriesWriteSchema,
} as const

function getMediakitCollection() {
  const db = getAdminDb()
  return db.collection('podcasts').doc(PODCAST_ID).collection('mediakit')
}

/**
 * Reads the complete mediakit contract. Invalid or missing docs come back as
 * `null` with a WARN — the generator decides whether it can proceed.
 */
export async function readMediakit(): Promise<MediakitData> {
  const snapshot = await getMediakitCollection().get()
  const docs = new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]))

  const result: MediakitData = { stats: null, audience: null, series: null }
  for (const section of Object.keys(READ_SCHEMAS) as MediakitSectionId[]) {
    const data = docs.get(section)
    if (data === undefined) {
      log('WARN', 'Mediakit section missing', { section })
      continue
    }
    const parsed = READ_SCHEMAS[section].safeParse(data)
    if (parsed.success) {
      result[section] = parsed.data as never
    } else {
      log('WARN', 'Invalid mediakit section skipped', {
        section,
        issues: parsed.error.issues,
      })
    }
  }
  return result
}

type SectionWriteMap = {
  stats: MediakitStatsWrite
  audience: MediakitAudienceWrite
  series: MediakitSeriesWrite
}

/**
 * Merge-writes one section on behalf of one collector adapter.
 *
 * Validates the partial against the section's write schema (unknown keys are
 * stripped), then `set(..., { merge: true })` — nested maps (e.g. a subset of
 * `followers`) merge without clobbering sibling fields written by others.
 *
 * @param source - Adapter identity (e.g. 'youtube', 'spotify', 'seed', 'manual')
 */
export async function writeMediakitSection<S extends MediakitSectionId>(
  section: S,
  partial: SectionWriteMap[S],
  source: string
): Promise<void> {
  const validated = WRITE_SCHEMAS[section].parse(partial)
  const fields = Object.keys(validated)
  if (fields.length === 0) {
    log('WARN', 'Mediakit write with no valid fields — skipped', { section, source })
    return
  }

  await getMediakitCollection()
    .doc(section)
    .set(
      {
        ...validated,
        updatedAt: FieldValue.serverTimestamp(),
        sources: {
          [source]: { updatedAt: FieldValue.serverTimestamp(), fields },
        },
      },
      { merge: true }
    )

  log('INFO', 'Mediakit section written', { section, source, fields })
}

/**
 * Persists the RENDERED display values — the exact formatted strings the
 * published PDF shows (an OUTPUT artifact like latest.pdf, not contract
 * data). The /midiakit page of apps/web displays these verbatim, so the page
 * and the PDF can never diverge (equalização por construção, 2026-08-31).
 *
 * Call ONLY after the PDF upload succeeded — same failsafe semantics: the
 * page always mirrors the artifact actually being served.
 */
export async function writeMediakitRendered(values: Record<string, string>): Promise<void> {
  await getMediakitCollection()
    .doc('rendered')
    .set({ values, updatedAt: FieldValue.serverTimestamp() })
  log('INFO', 'Mediakit rendered values written', { fields: Object.keys(values) })
}
