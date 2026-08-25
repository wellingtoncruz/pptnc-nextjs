/**
 * Mediakit widget bindings — the composite operations behind W1/W2 (slide-03
 * area charts) and W3/W4 (slide-04 donuts). Same string-surgery philosophy as
 * apply-bindings.ts: locate inside a bounded PANEL slice, guard everything,
 * replace in place.
 *
 * Panel style constants (peakY, donut colors) are design decisions carried
 * here — the data never contains them.
 */
import type { MediakitData } from '@/types/mediakit'

import { BindingError } from './apply-bindings'
import { MediakitDataError } from './bindings'
import {
  aggregateSpotifyMonthly,
  aggregateYoutubeHoursMonthly,
  areaChart,
  conicStops,
  legendPct,
  monthAxisLabel,
  picoMil,
} from './widgets'

/** Designer's top position for each chart's maximum (byte-exact contract). */
const CHART_STYLE = {
  spotify: { peakY: 41.1 },
  youtube: { peakY: 13.7 },
} as const

const GENDER_COLORS = ['#F26A21', '#E8A06B', '#56565E']
const AGE_COLORS = ['#F26A21', '#D9591F', '#E8A06B', '#B5895F', '#6E665C', '#44413B']

/** Age wedges/legend use the design's fixed order (not sorted by size). */
const AGE_CONIC_ORDER = ['35-44', '45-59', '28-34', '23-27', '18-22', '60+'] as const
const AGE_LEGEND_LABELS: Record<(typeof AGE_CONIC_ORDER)[number], string> = {
  '35-44': '35–44',
  '45-59': '45–59',
  '28-34': '28–34',
  '23-27': '23–27',
  '18-22': '18–22',
  '60+': '60+',
}
const GENDER_WORDS = { male: 'Homem', female: 'Mulher', notSpecified: 'Não informado' } as const

interface Slice {
  start: number
  end: number
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findOnce(html: string, slice: Slice, needle: string, what: string): number {
  const idx = html.indexOf(needle, slice.start)
  if (idx < 0 || idx >= slice.end) throw new BindingError(`${what}: "${needle}" not found in panel`)
  if (html.indexOf(needle, idx + 1) < slice.end && html.indexOf(needle, idx + 1) >= 0) {
    const second = html.indexOf(needle, idx + 1)
    if (second < slice.end) throw new BindingError(`${what}: "${needle}" ambiguous in panel`)
  }
  return idx
}

/** Replace exactly `count` regex matches inside the slice; returns new html. */
function replaceInSlice(
  html: string,
  slice: Slice,
  regex: RegExp,
  replacements: string[],
  what: string
): string {
  const segment = html.slice(slice.start, slice.end)
  const matches = [...segment.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'))]
  if (matches.length !== replacements.length) {
    throw new BindingError(
      `${what}: expected ${replacements.length} occurrence(s), found ${matches.length}`
    )
  }
  let out = ''
  let cursor = 0
  matches.forEach((m, i) => {
    const start = m.index ?? 0
    out += segment.slice(cursor, start) + replacements[i]
    cursor = start + m[0].length
  })
  out += segment.slice(cursor)
  const delta = out.length - segment.length
  const result = html.slice(0, slice.start) + out + html.slice(slice.end)
  slice.end += delta
  return result
}

function slideSlice(html: string, label: string, nextLabel: string | null): Slice {
  const start = html.indexOf(`<section data-label="${label}"`)
  if (start < 0) throw new BindingError(`slide "${label}" not found`)
  const end = nextLabel ? html.indexOf(`<section data-label="${nextLabel}"`) : html.length
  if (end < 0) throw new BindingError(`slide "${nextLabel}" not found (panel boundary)`)
  return { start, end }
}

// replaceInSlice does literal replacement (no $1) — the pico pattern keeps
// the label via lookahead instead.
function applyPico(html: string, panel: Slice, id: string, value: number): string {
  return replaceInSlice(
    html,
    panel,
    /(?<=>)[\d.,]+ mil(?=<\/div>\s*<div[^>]*>Pico mensal<\/div>)/,
    [picoMil(value)],
    `[${id}] pico`
  )
}

function applyRangeLabels(html: string, panel: Slice, id: string, chart: { firstMonth: string; lastMonth: string }): string {
  return replaceInSlice(
    html,
    panel,
    /(?<=>)[a-zà-ü]{3}\/\d{4}(?=<)/,
    [monthAxisLabel(chart.firstMonth), monthAxisLabel(chart.lastMonth)],
    `[${id}] range labels`
  )
}

export interface WidgetBindResult {
  html: string
  applied: string[]
}

export function applyMediakitWidgets(deckHtml: string, data: MediakitData): WidgetBindResult {
  if (!data.series) throw new MediakitDataError('series section missing/invalid in Firestore')
  if (!data.audience) throw new MediakitDataError('audience section missing/invalid in Firestore')
  if (data.series.spotifyDaily.length === 0 || data.series.youtubeWatchDaily.length === 0) {
    throw new MediakitDataError(
      'series are empty — run the collectors historical backfill before generating'
    )
  }

  let html = deckHtml
  const applied: string[] = []

  // ── W1/W2 · slide 03 charts ─────────────────────────────────────────────
  const slide3 = slideSlice(html, 'Cinco anos em números', 'Público')
  const ytLabelIdx = findOnce(html, slide3, 'Horas de exibição / mês', 'chart panels')

  const spotifyMonthly = aggregateSpotifyMonthly(data.series.spotifyDaily)
  const youtubeMonthly = aggregateYoutubeHoursMonthly(data.series.youtubeWatchDaily)

  const spPanel: Slice = { start: slide3.start, end: ytLabelIdx }
  const spChart = areaChart(spotifyMonthly, CHART_STYLE.spotify.peakY)
  html = replaceInSlice(html, spPanel, /<path d="[^"]+"/, [
    `<path d="${spChart.fillPath}"`,
    `<path d="${spChart.linePath}"`,
  ], '[W1] svg paths')
  html = replaceInSlice(html, spPanel, /left:[\d.]+%;bottom:[\d.]+%/, [
    `left:${spChart.dotLeft}%;bottom:${spChart.dotBottom}%`,
  ], '[W1] dot')
  html = applyPico(html, spPanel, 'W1', spChart.peakValue)
  html = applyRangeLabels(html, spPanel, 'W1', spChart)
  applied.push('W1')

  // YouTube panel: from its label to the end of slide 03 (recompute — offsets
  // above may have shifted).
  const slide3b = slideSlice(html, 'Cinco anos em números', 'Público')
  const ytStart = findOnce(html, slide3b, 'Horas de exibição / mês', 'yt panel')
  const ytPanel: Slice = { start: ytStart, end: slide3b.end }
  const ytChart = areaChart(youtubeMonthly, CHART_STYLE.youtube.peakY)
  html = replaceInSlice(html, ytPanel, /<path d="[^"]+"/, [
    `<path d="${ytChart.fillPath}"`,
    `<path d="${ytChart.linePath}"`,
  ], '[W2] svg paths')
  html = replaceInSlice(html, ytPanel, /left:[\d.]+%;bottom:[\d.]+%/, [
    `left:${ytChart.dotLeft}%;bottom:${ytChart.dotBottom}%`,
  ], '[W2] dot')
  html = applyPico(html, ytPanel, 'W2', ytChart.peakValue)
  html = applyRangeLabels(html, ytPanel, 'W2', ytChart)
  applied.push('W2')

  // ── W3 · gender donut ───────────────────────────────────────────────────
  const publico = slideSlice(html, 'Público', 'Caso PUC-PR')
  const genderStart = findOnce(html, publico, 'Gênero · todas as plataformas', 'gender panel')
  const ageStart = findOnce(html, publico, 'Faixa etária · todas as plataformas', 'age panel')
  const g = data.audience.gender
  const genderPanel: Slice = { start: genderStart, end: ageStart }

  html = replaceInSlice(html, genderPanel, /conic-gradient\([^)]+\)/, [
    `conic-gradient(${conicStops([g.male, g.female, g.notSpecified], GENDER_COLORS)})`,
  ], '[W3] conic')

  const dominant = (['male', 'female', 'notSpecified'] as const).reduce((a, b) =>
    g[b] > g[a] ? b : a
  )
  html = replaceInSlice(
    html,
    genderPanel,
    /(?<=>)\d+(?:,\d+)?%(?=<\/div>\s*<div[^>]*>(?:Homem|Mulher|Não informado)<\/div>)/,
    [legendPct(g[dominant])],
    '[W3] center value'
  )
  html = replaceInSlice(
    html,
    genderPanel,
    /(?<=<div[^>]*>)(?:Homem|Mulher|Não informado)(?=<\/div>)/,
    [GENDER_WORDS[dominant]],
    '[W3] center word'
  )
  for (const [key, word] of Object.entries(GENDER_WORDS) as Array<
    [keyof typeof GENDER_WORDS, string]
  >) {
    html = replaceInSlice(
      html,
      genderPanel,
      new RegExp(`(?<=>${escapeRegex(word)}</span>\\s*<span[^>]*>)[\\d,]+%(?=</span>)`),
      [legendPct(g[key])],
      `[W3] legend ${word}`
    )
  }
  applied.push('W3')

  // ── W4 · age donut ──────────────────────────────────────────────────────
  const publico2 = slideSlice(html, 'Público', 'Caso PUC-PR')
  const ageStart2 = findOnce(html, publico2, 'Faixa etária · todas as plataformas', 'age panel')
  const agePanel: Slice = { start: ageStart2, end: publico2.end }
  const age = data.audience.age

  html = replaceInSlice(html, agePanel, /conic-gradient\([^)]+\)/, [
    `conic-gradient(${conicStops(AGE_CONIC_ORDER.map((k) => age[k]), AGE_COLORS)})`,
  ], '[W4] conic')
  for (const key of AGE_CONIC_ORDER) {
    const label = AGE_LEGEND_LABELS[key]
    html = replaceInSlice(
      html,
      agePanel,
      new RegExp(`(?<=>${escapeRegex(label)}</span>\\s*<span[^>]*>)[\\d,]+%(?=</span>)`),
      [legendPct(age[key])],
      `[W4] legend ${label}`
    )
  }
  applied.push('W4')

  return { html, applied }
}
