/**
 * Shared daily-series load logic for collector adapters (Epic 30).
 *
 * Every raw daily series follows the same two-mode contract
 * (architectural correction 2026-08-25):
 * - HISTORICAL BACKFILL from the launch when nothing is stored;
 * - INCREMENTAL afterwards, refetching the last `overlapDays` so
 *   late-arriving source data overwrites by date.
 */

export const SERIES_BACKFILL_START = '2021-09-01'
export const SERIES_OVERLAP_DAYS = 7

/**
 * Força o modo BACKFILL mesmo com série já gravada.
 *
 * Existe para quando uma MÉTRICA NOVA é acrescentada a uma série antiga: o
 * incremental só traria os últimos dias, e o histórico ficaria sem o campo
 * novo para sempre. Com a flag, uma execução refaz a série inteira e o
 * `mergeByDate` sobrescreve por data.
 *
 * Uso pontual, via env do Job (`MEDIAKIT_SERIES_BACKFILL=1`), nunca ligada
 * em regime — o custo é refetch de todo o histórico a cada execução.
 */
export function isBackfillForced(): boolean {
  return process.env.MEDIAKIT_SERIES_BACKFILL === '1'
}

interface DatedPoint {
  date: string
}

/** Merges fresh daily points over stored ones — by date, fresh wins; sorted. */
export function mergeByDate<T extends DatedPoint>(stored: T[], fresh: T[]): T[] {
  const byDate = new Map(stored.map((p) => [p.date, p]))
  for (const point of fresh) byDate.set(point.date, point)
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Incremental start date: last stored minus overlap; backfill when empty. */
export function incrementalStart(
  stored: DatedPoint[],
  backfillStart: string = SERIES_BACKFILL_START,
  overlapDays: number = SERIES_OVERLAP_DAYS
): string {
  if (stored.length === 0 || isBackfillForced()) return backfillStart
  const from = new Date(`${stored[stored.length - 1].date}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - overlapDays)
  return from.toISOString().slice(0, 10)
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}
