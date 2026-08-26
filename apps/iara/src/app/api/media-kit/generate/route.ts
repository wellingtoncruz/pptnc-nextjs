/**
 * POST /api/media-kit/generate — machine-to-machine mediakit PDF generation
 * (Epic 30, story 30.4). Called by Cloud Scheduler (30.8) or manually with
 * the trigger header.
 *
 * Auth (pattern of the publications delivery route / TD-16):
 * - env `MEDIAKIT_TRIGGER_KEY` absent  → 503 (fail closed, never open)
 * - header `X-Mediakit-Key` missing/wrong → 401
 * The route is opted out of the auth proxy (proxy.ts) — a 307 here would mean
 * the opt-out broke (lesson_public_route_needs_proxy_optout).
 *
 * Pipeline: read contract → bind → repack → render (Chromium) → verify →
 * upload GCS `media-kit/latest.pdf`. ANY failure aborts BEFORE the upload —
 * the previous PDF is never overwritten by a broken one (failsafe).
 */
import { NextResponse, type NextRequest } from 'next/server'

import { readMediakit } from '@/lib/firebase/mediakit-admin'
import { uploadMediakitPdf } from '@/lib/firebase/cloud-storage'
import { log } from '@/lib/logger'
import { bindMediakitDeck } from '@/lib/mediakit/apply-bindings'
import { repackBundle, unpackBundle } from '@/lib/mediakit/bundle'
import { renderMediakitPdf } from '@/lib/mediakit/render'
import { loadMediakitTemplate } from '@/lib/mediakit/template'
import type { MediakitData } from '@/types/mediakit'

export const dynamic = 'force-dynamic'

const AGE_WARN_DAYS = 15

function sectionAgeDays(section: { updatedAt?: { toDate: () => Date } } | null): number | null {
  if (!section?.updatedAt) return null
  const ms = Date.now() - section.updatedAt.toDate().getTime()
  return Math.floor(ms / 86_400_000)
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

export async function POST(request: NextRequest) {
  const expectedKey = process.env.MEDIAKIT_TRIGGER_KEY
  if (!expectedKey) {
    log('ERROR', 'MEDIAKIT_TRIGGER_KEY not configured — generate endpoint disabled')
    return NextResponse.json({ error: 'Mediakit generation not configured' }, { status: 503 })
  }
  if (request.headers.get('x-mediakit-key') !== expectedKey) {
    log('WARN', 'Mediakit generate called with missing/invalid key')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const data = await readMediakit()
    const ages = staleness(data)

    const bundleHtml = await loadMediakitTemplate()
    const { deckHtml } = unpackBundle(bundleHtml)
    const expectedPages = deckHtml.split('<section ').length - 1

    const bound = bindMediakitDeck(deckHtml, data, new Date())
    const boundBundle = repackBundle(bundleHtml, bound.html)

    const rendered = await renderMediakitPdf(boundBundle, expectedPages)
    const path = await uploadMediakitPdf(rendered.pdf)

    const durationMs = Date.now() - startedAt
    log('INFO', 'Mediakit PDF generated and published', {
      durationMs,
      pages: rendered.pages,
      bytes: rendered.bytes,
      attempts: rendered.attempts,
      applied: bound.report.applied,
      notesChanged: bound.report.notesChanged,
      ...ages,
    })
    return NextResponse.json({
      ok: true,
      path,
      durationMs,
      pages: rendered.pages,
      bytes: rendered.bytes,
      renderAttempts: rendered.attempts,
      applied: bound.report.applied,
      unchanged: bound.report.unchanged,
      notesChanged: bound.report.notesChanged,
      staleness: ages,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    log('ERROR', 'Mediakit generation failed — previous PDF preserved', {
      error: message,
      durationMs: Date.now() - startedAt,
    })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
