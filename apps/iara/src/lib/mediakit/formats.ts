/**
 * Mediakit named formatters — each reproduces EXACTLY one display mask used
 * by the design (decision D5, 2026-08-25: the design's masks are the ruler,
 * including the anglophone "172k +" and "4,3M +").
 *
 * All masks are pt-BR: comma decimals, dot thousands.
 */

const NBSP_SAFE = { minimumFractionDigits: 0, maximumFractionDigits: 0 }

function ptFixed(value: number, decimals: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** `34.076` — integer with dot thousands. */
export function intDot(value: number): string {
  return Math.round(value).toLocaleString('pt-BR', NBSP_SAFE)
}

/** `+4,3 mi` — capa/patrocinador hero (1 decimal). */
export function plusCompactMi(value: number): string {
  return `+${ptFixed(value / 1_000_000, 1)} mi`
}

/** `4,3M` — slide-03 hero text node (the " +" suffix span stays untouched). */
export function compactM1(value: number): string {
  return `${ptFixed(value / 1_000_000, 1)}M`
}

/** `2,65` — slide-03 views text node (the " mi" suffix span stays untouched). */
export function compactMi2(value: number): string {
  return ptFixed(value / 1_000_000, 2)
}

/** `172k` — slide-03 watch-hours text node (" +" span stays; D5 keeps the k). */
export function kSuffix(value: number): string {
  return `${Math.round(value / 1_000)}k`
}

/** `34 mil` — prose/compact thousands. */
export function compactMil(value: number): string {
  return `${Math.round(value / 1_000)} mil`
}

/** `4,3 milhões` / `2,65 milhões` — prose for speaker notes. */
export function milhoesProse(value: number, decimals: number): string {
  return `${ptFixed(value / 1_000_000, decimals)} milhões`
}

/** `69` — integer percentage (no symbol; callers add context). */
export function percentInt(value: number): string {
  return String(Math.round(value))
}

/**
 * Years on air from a `YYYY-MM` launch: rounded months/12 — reproduces the
 * design's "5 anos" (set/2021 → ago/2026 = 59 months ⇒ 4,92 ⇒ 5).
 */
export function yearsSince(launch: string, now: Date): number {
  const [year, month] = launch.split('-').map(Number)
  const months = (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month)
  return Math.round(months / 12)
}

const YEAR_WORDS_CAP = ['Zero', 'Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez']

/** `Cinco` / `cinco` — small-number word for speaker-note prose. */
export function yearsWord(years: number, capitalized: boolean): string {
  const word = YEAR_WORDS_CAP[years]
  if (word === undefined) return String(years)
  return capitalized ? word : word.toLowerCase()
}
