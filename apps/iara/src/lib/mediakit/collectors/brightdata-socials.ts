/**
 * Adapter `brightdata-socials` — follower counts of the social profiles that
 * have no usable API (TikTok, Instagram, LinkedIn company) via the BrightData
 * profile scrapers (house precedent: the guests LinkedIn flow).
 *
 * Mini-spike of 2026-08-26 (real calls) validated the datasets:
 * - TikTok profiles    gd_l1villgoiiidt09ci (handle do PPTNC PENDENTE — env)
 * - Instagram profiles gd_l1vikfch901nx3by4 (async snapshot; followers 1251)
 * - LinkedIn company   gd_l1vikfnt1wgvvqz95w (sync response; followers 3262)
 *
 * Behaviors:
 * - FRESHNESS GUARD: skips the whole run while the last successful collection
 *   is younger than MEDIAKIT_SOCIALS_MAX_AGE_DAYS (default 7) — followers
 *   don't move materially per day and BrightData charges per record.
 * - PER-NETWORK ISOLATION: one network failing (dead_page, null followers,
 *   timeout) never blocks the others; the adapter only throws when ALL fail.
 * - REAL timeouts (TD-15 lesson): AbortSignal on every fetch + total deadline
 *   for the poll loop — never a decorative setTimeout.
 * - lesson_brightdata_null_fields: scalar nulls are tolerated by the schema;
 *   a missing followers value fails THAT network, never the whole payload.
 */
import { z } from 'zod'

import { readMediakit } from '@/lib/firebase/mediakit-admin'
import { log } from '@/lib/logger'

import type { CollectorAdapter, SectionWrite } from './runner'

// /trigger (não /scrape): o /scrape tenta responder inline e SEGURA a conexão
// além do timeout por request nos datasets assíncronos (visto no smoke com o
// Instagram); /trigger devolve o snapshot_id imediatamente e o poll assume.
const TRIGGER_URL = 'https://api.brightdata.com/datasets/v3/trigger'
const PROGRESS_URL = 'https://api.brightdata.com/datasets/v3/progress'
const SNAPSHOT_URL = 'https://api.brightdata.com/datasets/v3/snapshot'

const REQUEST_TIMEOUT_MS = 30_000
const TOTAL_DEADLINE_MS = 180_000
const POLL_INTERVAL_MS = 5_000

const DEFAULT_MAX_AGE_DAYS = 7

type NetworkKey = 'tiktok' | 'instagram' | 'linkedin'

interface NetworkConfig {
  key: NetworkKey
  datasetId: string
  /** Profile URL — env-overridable; TikTok has NO default until the producer
   * confirms the handle (skipped with a WARN while unset). */
  url: string | undefined
}

function networkConfigs(): NetworkConfig[] {
  return [
    {
      key: 'tiktok',
      datasetId: 'gd_l1villgoiiidt09ci',
      // Handle confirmado pelo Wellington em 2026-08-27; o dead_page do spike
      // era flakiness do endpoint /scrape antigo — via /trigger coleta normal.
      url: process.env.MEDIAKIT_TIKTOK_URL ?? 'https://www.tiktok.com/@pptnaocompila',
    },
    {
      key: 'instagram',
      datasetId: 'gd_l1vikfch901nx3by4',
      url: process.env.MEDIAKIT_INSTAGRAM_URL ?? 'https://www.instagram.com/pptnaocompila/',
    },
    {
      key: 'linkedin',
      datasetId: 'gd_l1vikfnt1wgvvqz95w',
      url: process.env.MEDIAKIT_LINKEDIN_URL ?? 'https://www.linkedin.com/company/pptnaocompila',
    },
  ]
}

export class BrightdataSocialsError extends Error {
  constructor(message: string) {
    super(`brightdata-socials: ${message}`)
    this.name = 'BrightdataSocialsError'
  }
}

/** Profile record — only what we consume; scalars may come as null
 * (lesson_brightdata_null_fields: tolerate, decide per field). */
const ProfileRecordSchema = z.object({
  followers: z.number().int().nonnegative().nullish(),
  error: z.string().nullish(),
  error_code: z.string().nullish(),
})

const SnapshotTicketSchema = z.object({ snapshot_id: z.string() })
const ProgressSchema = z.object({ status: z.string() })

async function bdFetch(url: string, apiKey: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

function firstRecord(payload: unknown): unknown {
  return Array.isArray(payload) ? payload[0] : payload
}

/** Trigger → (maybe poll) → record, under a REAL total deadline. */
async function scrapeProfile(
  config: NetworkConfig,
  apiKey: string
): Promise<z.infer<typeof ProfileRecordSchema>> {
  const deadline = Date.now() + TOTAL_DEADLINE_MS

  const trigger = await bdFetch(
    `${TRIGGER_URL}?dataset_id=${config.datasetId}&include_errors=true`,
    apiKey,
    { method: 'POST', body: JSON.stringify([{ url: config.url }]) }
  )
  if (!trigger.ok) {
    throw new BrightdataSocialsError(`${config.key}: trigger failed ${trigger.status}`)
  }
  const ticket = SnapshotTicketSchema.parse(await trigger.json())

  while (Date.now() < deadline) {
    const progress = await bdFetch(`${PROGRESS_URL}/${ticket.snapshot_id}`, apiKey)
    if (!progress.ok) {
      throw new BrightdataSocialsError(`${config.key}: progress failed ${progress.status}`)
    }
    const { status } = ProgressSchema.parse(await progress.json())
    if (status === 'ready') {
      const snapshot = await bdFetch(`${SNAPSHOT_URL}/${ticket.snapshot_id}?format=json`, apiKey)
      if (!snapshot.ok) {
        throw new BrightdataSocialsError(`${config.key}: snapshot failed ${snapshot.status}`)
      }
      return ProfileRecordSchema.parse(firstRecord(await snapshot.json()))
    }
    if (status === 'failed') {
      throw new BrightdataSocialsError(`${config.key}: snapshot reported failed`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new BrightdataSocialsError(
    `${config.key}: total deadline of ${TOTAL_DEADLINE_MS}ms exhausted while polling`
  )
}

/** Age (days) of this adapter's last successful write, from `sources`. */
function lastRunAgeDays(sources: unknown): number | null {
  const entry = (sources as Record<string, { updatedAt?: { toDate: () => Date } }> | undefined)?.[
    'brightdata-socials'
  ]
  if (!entry?.updatedAt) return null
  return (Date.now() - entry.updatedAt.toDate().getTime()) / 86_400_000
}

export const brightdataSocialsAdapter: CollectorAdapter = {
  name: 'brightdata-socials',
  async collect(): Promise<SectionWrite[]> {
    const apiKey = process.env.BRIGHTDATA_API_KEY
    if (!apiKey) throw new BrightdataSocialsError('BRIGHTDATA_API_KEY não configurada')

    const maxAgeDays = Number(process.env.MEDIAKIT_SOCIALS_MAX_AGE_DAYS ?? DEFAULT_MAX_AGE_DAYS)
    const audience = (await readMediakit()).audience
    const age = lastRunAgeDays(audience?.sources)
    if (age !== null && age < maxAgeDays) {
      log('INFO', 'brightdata-socials fresh — skipping (cost guard)', {
        ageDays: Math.round(age * 10) / 10,
        maxAgeDays,
      })
      return []
    }

    const followers: Partial<Record<NetworkKey, number>> = {}
    const failures: string[] = []

    for (const config of networkConfigs()) {
      if (!config.url) {
        log('WARN', 'brightdata-socials: network without profile URL — skipped', {
          network: config.key,
          hint: 'set MEDIAKIT_TIKTOK_URL when the handle is confirmed',
        })
        continue
      }
      try {
        const record = await scrapeProfile(config, apiKey)
        if (record.error || record.error_code) {
          throw new BrightdataSocialsError(
            `${config.key}: scraper error ${record.error_code ?? ''} ${record.error ?? ''}`.trim()
          )
        }
        if (record.followers === null || record.followers === undefined) {
          throw new BrightdataSocialsError(`${config.key}: record has no followers value`)
        }
        followers[config.key] = record.followers
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown'
        failures.push(message)
        log('ERROR', 'brightdata-socials network failed — continuing with the others', {
          network: config.key,
          error: message,
        })
      }
    }

    if (Object.keys(followers).length === 0) {
      throw new BrightdataSocialsError(
        `no network collected (${failures.join(' | ') || 'nothing configured'})`
      )
    }
    return [{ section: 'audience', partial: { followers } }]
  },
}
