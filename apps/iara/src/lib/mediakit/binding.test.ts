import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import type { MediakitData } from '@/types/mediakit'

import { bindMediakitDeck, applyMediakitValueBindings, BindingError } from './apply-bindings'
import { deriveMediakitValues } from './bindings'
import { BundleStructureError, repackBundle, unpackBundle } from './bundle'
import {
  MEDIAKIT_SEED_AUDIENCE,
  MEDIAKIT_SEED_SERIES,
  MEDIAKIT_SEED_STATS,
} from './seed-values'

/** The date the seed values were read off the design — freezes derivations. */
const SEED_NOW = new Date(Date.UTC(2026, 7, 25))

const SEED_DATA: MediakitData = {
  stats: MEDIAKIT_SEED_STATS,
  audience: MEDIAKIT_SEED_AUDIENCE,
  series: MEDIAKIT_SEED_SERIES,
}

let bundleHtml: string
let deckHtml: string

beforeAll(() => {
  bundleHtml = readFileSync(resolve(process.cwd(), 'mediakit-template/standalone.html'), 'utf-8')
  deckHtml = unpackBundle(bundleHtml).deckHtml
})

describe('bundle unpack/repack', () => {
  it('unpacks the real template into an 11-slide deck', () => {
    expect(deckHtml.split('<section ').length - 1).toBe(11)
    expect(deckHtml).toContain('data-label="Capa"')
    expect(deckHtml).toContain('data-label="Bora Gravar?"')
  })

  it('round-trips: repack + unpack yields the same deck', () => {
    const repacked = repackBundle(bundleHtml, deckHtml)
    expect(unpackBundle(repacked).deckHtml).toBe(deckHtml)
  })

  it('repack leaves everything outside the template block untouched', () => {
    const marker = '<script type="__bundler/template">'
    const repacked = repackBundle(bundleHtml, deckHtml)
    expect(repacked.slice(0, repacked.indexOf(marker))).toBe(
      bundleHtml.slice(0, bundleHtml.indexOf(marker))
    )
  })

  it('fails LOUD on a bundle without the template block (format drift guard)', () => {
    expect(() => unpackBundle('<!doctype html><p>not a bundle</p>')).toThrow(BundleStructureError)
  })

  it('fails LOUD when the template block is not a JSON string', () => {
    const broken = bundleHtml.replace(
      /(<script type="__bundler\/template">)[\s\S]*?(<\/script>)/,
      '$1{"not":"a string"}$2'
    )
    expect(() => unpackBundle(broken)).toThrow(BundleStructureError)
  })
})

describe('GOLDEN — idempotence over the template', () => {
  it('value bindings with the seed values reproduce the deck BYTE-IDENTICAL', () => {
    const derived = deriveMediakitValues(SEED_DATA, SEED_NOW)
    const result = applyMediakitValueBindings(deckHtml, derived)
    expect(result.report.applied).toEqual([])
    expect(result.html).toBe(deckHtml)
  })

  it('full bind only touches the stale speaker notes (slide 03 counts)', () => {
    const result = bindMediakitDeck(deckHtml, SEED_DATA, SEED_NOW)
    // Capa and Público notes templates reproduce the current prose exactly;
    // slide 03 notes are stale in the export (224/1.120/1.792/159 mil) and
    // get healed to the seed values.
    expect(result.report.notesChanged).toEqual(['Cinco anos em números'])
    expect(result.html).toContain('234 episódios, 1.170 cortes, 1.872 shorts')
    expect(result.html).toContain('mais de 172 mil horas de exibição')
    // Nothing outside the notes attribute changed.
    const stripNotes = (html: string) => html.replace(/data-speaker-notes="[^"]*"/g, '')
    expect(stripNotes(result.html)).toBe(stripNotes(deckHtml))
  })
})

describe('bindings apply real changes', () => {
  it('a changed count lands in the right slide with pt-BR formatting', () => {
    const data: MediakitData = {
      ...SEED_DATA,
      stats: { ...MEDIAKIT_SEED_STATS, episodes: 240, cuts: 1234 },
    }
    const result = bindMediakitDeck(deckHtml, data, SEED_NOW)
    expect(result.report.applied).toEqual(expect.arrayContaining(['N3', 'N4']))
    expect(result.html).toContain('>240</div>')
    expect(result.html).toContain('>1.234</div>')
    expect(result.html).not.toContain('>234</div>')
  })

  it('D6: views = YouTube + Spotify parcels, formatted with 2 decimals', () => {
    const data: MediakitData = {
      ...SEED_DATA,
      stats: { ...MEDIAKIT_SEED_STATS, viewsYoutube: 2_900_000, viewsSpotifyStreams: 60_000 },
    }
    const result = bindMediakitDeck(deckHtml, data, SEED_NOW)
    expect(result.report.applied).toContain('N2')
    expect(result.html).toContain('>2,96<')
  })

  it('demographics drive the 69% center, the strip and slide 09 together', () => {
    const data: MediakitData = {
      ...SEED_DATA,
      audience: {
        ...MEDIAKIT_SEED_AUDIENCE,
        age: { ...MEDIAKIT_SEED_AUDIENCE.age, '35-44': 40.0, '45-59': 31.0 },
      },
    }
    const result = bindMediakitDeck(deckHtml, data, SEED_NOW)
    expect(result.report.applied).toEqual(expect.arrayContaining(['P6', 'P6b', 'S2']))
    expect(result.html).toContain('71% da audiência tem entre 35 e 59 anos')
    expect(result.html).not.toContain('69% da audiência')
  })

  it('the year and years-on-air derive from now/launch', () => {
    const now2027 = new Date(Date.UTC(2027, 9, 1))
    const result = bindMediakitDeck(deckHtml, SEED_DATA, now2027)
    expect(result.report.applied).toEqual(expect.arrayContaining(['C1', 'C4']))
    expect(result.html).toContain('Media Kit — 2027')
    expect(result.html).toContain('>6 anos</div>')
  })
})

describe('guards fail loud', () => {
  it('renamed label (design edit) throws with slide + binding id', () => {
    const tampered = deckHtml.replace('Inscritos no YouTube', 'Inscritos no Tube')
    const derived = deriveMediakitValues(SEED_DATA, SEED_NOW)
    expect(() => applyMediakitValueBindings(tampered, derived)).toThrow(/P1.*Público/)
  })

  it('unexpected current value shape (template drift) throws', () => {
    const tampered = deckHtml.replace('>34.076<', '>trinta e quatro mil<')
    const derived = deriveMediakitValues(SEED_DATA, SEED_NOW)
    expect(() => applyMediakitValueBindings(tampered, derived)).toThrow(BindingError)
  })

  it('missing contract section throws before touching the deck', () => {
    expect(() => bindMediakitDeck(deckHtml, { ...SEED_DATA, stats: null }, SEED_NOW)).toThrow(
      /stats section missing/
    )
  })
})
