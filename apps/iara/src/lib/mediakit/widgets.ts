/**
 * Mediakit widget geometry — the deterministic transforms behind the slide-03
 * area charts and the slide-04 donuts. Reverse-engineered from the template
 * (story 30.3) and proven byte-exact by the golden test.
 *
 * Aggregation lives HERE (the consumer), never in the collectors: the
 * contract stores raw DAILY series (architectural correction 2026-08-25).
 *
 * Chart formulas (viewBox 0 0 1000 300, x-pad 8, fill baseline y=292):
 *   x_i = round1(8 + i · 984/(n−1))
 *   y_i = round1(292 − v_i · (292 − peakY)/vmax)
 * where `peakY` is the designer's chosen top position for the series maximum
 * (a per-chart style constant carried by the binding map, NOT derived).
 * Dot: first index of the maximum → left = round1(x/10)%, bottom =
 * round1((300 − y)/3)%.
 */
import type { MediakitSpotifyDailyPoint, MediakitYoutubeWatchDailyPoint } from '@/types/mediakit'

export interface MonthlyPoint {
  month: string
  value: number
}

function sumByMonth(dates: string[], values: number[]): MonthlyPoint[] {
  const totals = new Map<string, number>()
  for (let i = 0; i < dates.length; i++) {
    const month = dates[i].slice(0, 7)
    totals.set(month, (totals.get(month) ?? 0) + values[i])
  }
  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, value]) => ({ month, value }))
}

/** Spotify chart input: monthly sum of `starts` (provisional mapping —
 * confirm "Streams & downloads" ↔ starts against the dashboard in 30.6). */
export function aggregateSpotifyMonthly(daily: MediakitSpotifyDailyPoint[]): MonthlyPoint[] {
  return sumByMonth(daily.map((p) => p.date), daily.map((p) => p.starts))
}

/** YouTube chart input: monthly watch HOURS (minutes summed, then rounded). */
export function aggregateYoutubeHoursMonthly(
  daily: MediakitYoutubeWatchDailyPoint[]
): MonthlyPoint[] {
  return sumByMonth(daily.map((p) => p.date), daily.map((p) => p.minutes)).map(
    ({ month, value }) => ({ month, value: Math.round(value / 60) })
  )
}

const round1 = (v: number) => Math.round(v * 10) / 10
const fmt1 = (v: number) => round1(v).toFixed(1)

export interface AreaChart {
  linePath: string
  fillPath: string
  dotLeft: string
  dotBottom: string
  peakValue: number
  firstMonth: string
  lastMonth: string
}

export function areaChart(series: MonthlyPoint[], peakY: number): AreaChart {
  if (series.length < 2) {
    throw new Error(`areaChart needs at least 2 monthly points, got ${series.length}`)
  }
  const values = series.map((p) => p.value)
  const vmax = Math.max(...values)
  if (vmax <= 0) throw new Error('areaChart series has no positive value')

  const n = series.length
  const step = 984 / (n - 1)
  const scale = (292 - peakY) / vmax

  const points = values.map((v, i) => ({
    x: round1(8 + i * step),
    y: round1(292 - v * scale),
  }))

  const linePath = 'M' + points.map((p) => `${fmt1(p.x)} ${fmt1(p.y)}`).join(' L')
  const fillPath = `${linePath} L${fmt1(points[n - 1].x)} 292.0 L8.0 292.0 Z`

  let peakIndex = 0
  for (let i = 1; i < n; i++) if (values[i] > values[peakIndex]) peakIndex = i

  return {
    linePath,
    fillPath,
    dotLeft: fmt1(round1(points[peakIndex].x / 10)),
    dotBottom: fmt1(round1((300 - points[peakIndex].y) / 3)),
    peakValue: vmax,
    firstMonth: series[0].month,
    lastMonth: series[n - 1].month,
  }
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** `2021-10` → `out/2021` (the axis labels; CSS uppercases them). */
export function monthAxisLabel(month: string): string {
  const [year, m] = month.split('-')
  return `${MONTHS_PT[Number(m) - 1]}/${year}`
}

/** `2700` → `2,7 mil` (the "Pico mensal" mask). */
export function picoMil(value: number): string {
  return `${(Math.round(value / 100) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`
}

/** Conic boundary: `84`, `94.4` — point decimal, trailing zeros trimmed. */
function stopPct(v: number): string {
  return String(Math.round(v * 10) / 10)
}

/**
 * `conic-gradient` inner stops from ordered shares (order and colors are the
 * design's, fixed by position — wedges are NOT re-sorted by size).
 */
export function conicStops(parts: number[], colors: string[]): string {
  if (parts.length !== colors.length) {
    throw new Error(`conicStops: ${parts.length} parts vs ${colors.length} colors`)
  }
  const segments: string[] = []
  let acc = 0
  for (let i = 0; i < parts.length; i++) {
    const from = i === 0 ? '0' : `${stopPct(acc)}%`
    acc += parts[i]
    const to = i === parts.length - 1 ? '100%' : `${stopPct(acc)}%`
    segments.push(`${colors[i]} ${from} ${to}`)
  }
  return segments.join(',')
}

/** Legend/center percentage: `84%` (integer) or `10,4%` (1-decimal, comma). */
export function legendPct(v: number): string {
  const rounded = Math.round(v * 10) / 10
  return Number.isInteger(rounded)
    ? `${rounded}%`
    : `${rounded.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}
