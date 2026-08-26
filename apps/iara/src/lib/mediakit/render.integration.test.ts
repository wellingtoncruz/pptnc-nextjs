/**
 * Integration: real Chromium render of the bound template (story 30.4).
 *
 * Requires a local Chrome/Chromium. Run with:
 *   MEDIAKIT_INTEGRATION_TESTS=true npx vitest run src/lib/mediakit/render.integration.test.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { MediakitData } from '@/types/mediakit'

import { bindMediakitDeck } from './apply-bindings'
import { repackBundle, unpackBundle } from './bundle'
import { DESIGN_SERIES_FIXTURE } from './design-series-fixture'
import { renderMediakitPdf } from './render'
import { MEDIAKIT_SEED_AUDIENCE, MEDIAKIT_SEED_STATS } from './seed-values'

const INTEGRATION = process.env.MEDIAKIT_INTEGRATION_TESTS === 'true'

describe.skipIf(!INTEGRATION)('mediakit render integration (real Chromium)', () => {
  it('renders the bound bundle to a verified 11-page 1440×810 PDF', async () => {
    const bundleHtml = readFileSync(
      resolve(process.cwd(), 'mediakit-template/standalone.html'),
      'utf-8'
    )
    const { deckHtml } = unpackBundle(bundleHtml)
    const data: MediakitData = {
      stats: MEDIAKIT_SEED_STATS,
      audience: MEDIAKIT_SEED_AUDIENCE,
      series: DESIGN_SERIES_FIXTURE,
    }
    const bound = bindMediakitDeck(deckHtml, data, new Date())
    const result = await renderMediakitPdf(repackBundle(bundleHtml, bound.html), 11)

    expect(result.pages).toBe(11)
    expect(result.bytes).toBeGreaterThan(2_000_000)
  }, 400_000)
})
