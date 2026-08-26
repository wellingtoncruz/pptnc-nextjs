/**
 * Mediakit collector framework (Epic 30, story 30.5).
 *
 * ONE job asset (`mediakit-collector`) runs every source adapter in sequence.
 * Isolation is the contract: an adapter failure NEVER stops the others — its
 * error lands in the report and the run continues (partial data is better
 * than no data; the generator's staleness WARNs surface what's behind).
 *
 * Each adapter returns section partials; the runner writes them through
 * `writeMediakitSection` with the adapter's name as `source` — nobody touches
 * another adapter's fields (merge semantics of the contract).
 */
import { writeMediakitSection } from '@/lib/firebase/mediakit-admin'
import { log } from '@/lib/logger'
import type { MediakitSectionId } from '@/lib/schemas/mediakit'
import type {
  MediakitAudienceWrite,
  MediakitSeriesWrite,
  MediakitStatsWrite,
} from '@/types/mediakit'

export type SectionWrite =
  | { section: 'stats'; partial: MediakitStatsWrite }
  | { section: 'audience'; partial: MediakitAudienceWrite }
  | { section: 'series'; partial: MediakitSeriesWrite }

export interface CollectorAdapter {
  name: string
  collect(): Promise<SectionWrite[]>
}

export interface AdapterReport {
  name: string
  ok: boolean
  fields: string[]
  error?: string
}

export interface CollectReport {
  adapters: AdapterReport[]
  ok: boolean
}

export async function runCollectors(adapters: CollectorAdapter[]): Promise<CollectReport> {
  const reports: AdapterReport[] = []

  for (const adapter of adapters) {
    try {
      const writes = await adapter.collect()
      const fields: string[] = []
      for (const write of writes) {
        await writeMediakitSection(
          write.section as MediakitSectionId,
          write.partial as never,
          adapter.name
        )
        fields.push(...Object.keys(write.partial).map((f) => `${write.section}.${f}`))
      }
      reports.push({ name: adapter.name, ok: true, fields })
      log('INFO', 'Mediakit adapter collected', { adapter: adapter.name, fields })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      reports.push({ name: adapter.name, ok: false, fields: [], error: message })
      log('ERROR', 'Mediakit adapter failed — continuing with the others', {
        adapter: adapter.name,
        error: message,
      })
    }
  }

  return { adapters: reports, ok: reports.every((r) => r.ok) }
}
