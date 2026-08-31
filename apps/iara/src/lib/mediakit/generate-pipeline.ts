/**
 * Mediakit generation pipeline (Epic 30) — the complete run of the GENERATOR
 * asset: read contract → bind → repack → render (Chromium) → verify → upload.
 *
 * Called by the `mediakit-generator` Cloud Run Job (jobs/mediakit/generate.ts)
 * — there is deliberately NO HTTP trigger (architecture decision 2026-08-26:
 * batch processes are standalone job assets; see
 * feedback_batch_jobs_not_http_endpoints).
 *
 * FAILSAFE: any failure throws BEFORE `uploadMediakitPdf` — the previous
 * `media-kit/latest.pdf` is never overwritten by a broken render.
 */
import { uploadMediakitPdf } from '@/lib/firebase/cloud-storage'
import { readMediakit, writeMediakitRendered } from '@/lib/firebase/mediakit-admin'
import { log } from '@/lib/logger'
import type { MediakitData } from '@/types/mediakit'

import { bindMediakitDeck } from './apply-bindings'
import { buildRenderedValues, deriveMediakitValues } from './bindings'
import { repackBundle, unpackBundle } from './bundle'
import { renderMediakitPdf } from './render'
import { loadMediakitTemplate } from './template'

const AGE_WARN_DAYS = 15

function sectionAgeDays(section: { updatedAt?: { toDate: () => Date } } | null): number | null {
  if (!section?.updatedAt) return null
  return Math.floor((Date.now() - section.updatedAt.toDate().getTime()) / 86_400_000)
}

function staleness(data: MediakitData) {
  const ages = {
    statsAgeDays: sectionAgeDays(data.stats),
    audienceAgeDays: sectionAgeDays(data.audience),
    seriesAgeDays: sectionAgeDays(data.series),
  }
  for (const [key, age] of Object.entries(ages)) {
    if (age !== null && age > AGE_WARN_DAYS) {
      log('WARN', 'Mediakit source data is stale', { section: key, ageDays: age })
    }
  }
  return ages
}

export interface GenerationReport {
  path: string
  durationMs: number
  pages: number
  bytes: number
  renderAttempts: number
  applied: string[]
  unchanged: string[]
  notesChanged: string[]
  staleness: ReturnType<typeof staleness>
}

export async function runMediakitGeneration(): Promise<GenerationReport> {
  const startedAt = Date.now()

  const data = await readMediakit()
  const ages = staleness(data)
  // Deriva JÁ AQUI: contrato incompleto falha alto antes de qualquer render/
  // upload; o mesmo derived alimenta o doc `rendered` após o publish.
  const derived = deriveMediakitValues(data, new Date())

  const bundleHtml = await loadMediakitTemplate()
  const { deckHtml } = unpackBundle(bundleHtml)
  const expectedPages = deckHtml.split('<section ').length - 1

  const bound = bindMediakitDeck(deckHtml, data, new Date())
  const boundBundle = repackBundle(bundleHtml, bound.html)

  const rendered = await renderMediakitPdf(boundBundle, expectedPages)
  const path = await uploadMediakitPdf(rendered.pdf)

  // Só APÓS o upload: a página /midiakit exibe estas strings verbatim, e elas
  // devem espelhar sempre o PDF que está de fato publicado.
  await writeMediakitRendered(buildRenderedValues(derived))

  const report: GenerationReport = {
    path,
    durationMs: Date.now() - startedAt,
    pages: rendered.pages,
    bytes: rendered.bytes,
    renderAttempts: rendered.attempts,
    applied: bound.report.applied,
    unchanged: bound.report.unchanged,
    notesChanged: bound.report.notesChanged,
    staleness: ages,
  }
  log('INFO', 'Mediakit PDF generated and published', { ...report })
  return report
}
