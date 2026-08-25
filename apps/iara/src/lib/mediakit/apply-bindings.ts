/**
 * Mediakit binding engine — pure string surgery over the deck HTML.
 *
 * No HTML parser on purpose: the golden test demands byte-identity when the
 * data equals what the design shows, and a parse→serialize round trip could
 * silently normalize whitespace/entities. Every binding is located inside its
 * slide slice and replaced in place; anything unexpected throws BindingError
 * (guards: slide exists once, anchor resolves exactly once, current value
 * matches the binding's `expect` shape).
 */
import type { MediakitData } from '@/types/mediakit'

import {
  deriveMediakitValues,
  MEDIAKIT_SPEAKER_NOTES,
  MEDIAKIT_TEXT_BINDINGS,
  type MediakitDerived,
  type TextBinding,
} from './bindings'
// Circular at module level with widget-bindings (which imports BindingError);
// safe under ESM: both sides only touch the other inside function bodies.
import { applyMediakitWidgets } from './widget-bindings'

export class BindingError extends Error {
  constructor(message: string) {
    super(`Mediakit binding error: ${message}`)
    this.name = 'BindingError'
  }
}

export interface BindResult {
  html: string
  report: {
    applied: string[]
    unchanged: string[]
    notesChanged: string[]
  }
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface SlideSlice {
  start: number
  end: number
}

function sliceSlide(deckHtml: string, slide: string): SlideSlice {
  const marker = `<section data-label="${slide}"`
  const first = deckHtml.indexOf(marker)
  if (first < 0) throw new BindingError(`slide "${slide}" not found (data-label)`)
  if (deckHtml.indexOf(marker, first + 1) >= 0) {
    throw new BindingError(`slide "${slide}" appears more than once`)
  }
  const next = deckHtml.indexOf('<section ', first + marker.length)
  return { start: first, end: next < 0 ? deckHtml.length : next }
}

/** Replaces [from, to) inside html with replacement. */
function splice(html: string, from: number, to: number, replacement: string): string {
  return html.slice(0, from) + replacement + html.slice(to)
}

/**
 * Locates the value core of a binding inside its slide and returns absolute
 * [from, to) plus the current core text.
 */
function locate(deckHtml: string, binding: TextBinding): { from: number; to: number; core: string } {
  const { start, end } = sliceSlide(deckHtml, binding.slide)
  const slice = deckHtml.slice(start, end)

  let regex: RegExp
  let groupIndex: number
  if (binding.kind === 'stat') {
    // <div ...>CORE[<span ...>suffix</span>][ws]</div> [ws] <div ...>LABEL</div>
    regex = new RegExp(
      `>([^<>]*?)(\\s*(?:<span[^>]*>[^<]*</span>)?\\s*)</div>\\s*<div[^>]*>${escapeRegex(binding.label)}</div>`,
      'dg'
    )
    groupIndex = 1
  } else if (binding.kind === 'follower-row') {
    regex = new RegExp(
      `>${escapeRegex(binding.network)}</span>\\s*<span[^>]*>([^<>]+)</span>`,
      'dg'
    )
    groupIndex = 1
  } else {
    // 'd' (hasIndices) added here — the literal /d flag needs target es2022.
    regex = new RegExp(binding.pattern.source, 'dg')
    groupIndex = 1
  }

  const matches = [...slice.matchAll(regex)]
  if (matches.length === 0) {
    throw new BindingError(`[${binding.id}] anchor not found in slide "${binding.slide}"`)
  }
  if (matches.length > 1) {
    throw new BindingError(
      `[${binding.id}] anchor resolves ${matches.length}x in slide "${binding.slide}" — ambiguous`
    )
  }

  const match = matches[0]
  const indices = (match as RegExpMatchArray & { indices?: Array<[number, number]> }).indices
  if (!indices || !indices[groupIndex]) {
    throw new BindingError(`[${binding.id}] engine bug: no match indices for value group`)
  }
  const [groupFrom, groupTo] = indices[groupIndex]
  const core = slice.slice(groupFrom, groupTo)

  if (!binding.expect.test(core.trim())) {
    throw new BindingError(
      `[${binding.id}] current value ${JSON.stringify(core.trim())} does not match expected shape ${binding.expect} — template drifted?`
    )
  }
  return { from: start + groupFrom, to: start + groupTo, core }
}

/** Applies the value bindings (stats, follower rows, patterns). */
export function applyMediakitValueBindings(
  deckHtml: string,
  derived: MediakitDerived
): BindResult {
  let html = deckHtml
  const applied: string[] = []
  const unchanged: string[] = []

  for (const binding of MEDIAKIT_TEXT_BINDINGS) {
    const { from, to, core } = locate(html, binding)
    const next = binding.render(derived)
    if (!binding.expect.test(next)) {
      throw new BindingError(
        `[${binding.id}] rendered value ${JSON.stringify(next)} does not match its own expected shape ${binding.expect}`
      )
    }
    if (next === core) {
      unchanged.push(binding.id)
      continue
    }
    html = splice(html, from, to, next)
    applied.push(binding.id)
  }

  return { html, report: { applied, unchanged, notesChanged: [] } }
}

/** Regenerates the speaker-notes attributes of the slides we own. */
export function applyMediakitSpeakerNotes(
  deckHtml: string,
  derived: MediakitDerived
): BindResult {
  let html = deckHtml
  const notesChanged: string[] = []

  for (const notes of MEDIAKIT_SPEAKER_NOTES) {
    const { start, end } = sliceSlide(html, notes.slide)
    const slice = html.slice(start, end)
    const attrRegex = new RegExp('data-speaker-notes="([^"]*)"', 'dg')
    const matches = [...slice.matchAll(attrRegex)]
    if (matches.length !== 1) {
      throw new BindingError(
        `speaker-notes attr resolves ${matches.length}x in slide "${notes.slide}"`
      )
    }
    const generated = notes.build(derived)
    if (/[<>"&]/.test(generated)) {
      throw new BindingError(
        `generated speaker-notes for "${notes.slide}" contain HTML-unsafe characters`
      )
    }
    const indices = (matches[0] as RegExpMatchArray & { indices?: Array<[number, number]> })
      .indices
    if (!indices || !indices[1]) throw new BindingError('engine bug: no indices for notes attr')
    const [groupFrom, groupTo] = indices[1]
    const current = slice.slice(groupFrom, groupTo)
    if (current !== generated) {
      html = splice(html, start + groupFrom, start + groupTo, generated)
      notesChanged.push(notes.slide)
    }
  }

  return { html, report: { applied: [], unchanged: [], notesChanged } }
}

/** Full binding pass: text values + widgets (charts/donuts) + speaker notes. */
export function bindMediakitDeck(deckHtml: string, data: MediakitData, now: Date): BindResult {
  const derived = deriveMediakitValues(data, now)
  const values = applyMediakitValueBindings(deckHtml, derived)
  const widgets = applyMediakitWidgets(values.html, data)
  const notes = applyMediakitSpeakerNotes(widgets.html, derived)
  return {
    html: notes.html,
    report: {
      applied: [...values.report.applied, ...widgets.applied],
      unchanged: values.report.unchanged,
      notesChanged: notes.report.notesChanged,
    },
  }
}
