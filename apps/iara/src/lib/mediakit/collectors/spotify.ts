/**
 * Adapter `spotify` — daily streams series, followers and demographics from
 * the Spotify for Podcasters INTERNAL dashboard API.
 *
 * TS port of the flow validated in the 2026-08-25 spike (reference:
 * openpodcast/spotify-connector 0.8.3):
 * 1. PKCE-like web_message authorization at accounts.spotify.com/oauth2/v2/auth
 *    with the `sp_dc`/`sp_key` browser cookies + static web client_id →
 *    an HTML page embedding `const authorizationResponse = {...}` with a code;
 * 2. code + verifier → bearer (~1h) at accounts.spotify.com/api/token;
 * 3. data at generic.wg.spotify.com/podcasters/v0/shows/{id}/... .
 *
 * Unofficial API: every response is Zod-validated and a mismatch fails LOUD
 * (the runner isolates it; the generator keeps the last good data — failsafe).
 * `login_required` in the auth response ⇒ cookies expired (~yearly): the
 * error tells the producer exactly how to renew.
 *
 * Series rules (architectural correction 2026-08-25): `spotifyDaily` stores
 * the RAW `{date, starts, streams}` pairs; backfill from launch when empty,
 * incremental with overlap afterwards. Demographics come from `aggregate`
 * over a rolling window (default 90d — inventory decision).
 *
 * Followers (story 31.2, spike of 2026-09-04 with a real call): the `followers`
 * endpoint hands `{counts: [{date, count}]}` daily since 2021-09-01 and does
 * NOT split gains from losses — only the running TOTAL. That total is what gets
 * stored, on the same daily point as the streams; the weekly variation the
 * Dashboard draws is derived at read time. The series lags the streams one by
 * ~2 days, so the last points legitimately have no `followers` yet.
 */
import { createHash, randomBytes } from 'node:crypto'

import { z } from 'zod'

import { readMediakit } from '@/lib/firebase/mediakit-admin'
import { log } from '@/lib/logger'

import type { CollectorAdapter, SectionWrite } from './runner'
import { incrementalStart, isoToday, mergeByDate, SERIES_BACKFILL_START } from './series-utils'

const BASE_URL = 'https://generic.wg.spotify.com/podcasters/v0'
const WEB_CLIENT_ID = '05a1371ee5194c27860b3ff3ff3979d2'
const SHOW_ID = '5aKHRdBlylb2wj5Ac8Kqpj' // PPT Não Compila
const DEMOGRAPHICS_WINDOW_DAYS = 90

export class SpotifyAdapterError extends Error {
  constructor(message: string) {
    super(`spotify adapter: ${message}`)
    this.name = 'SpotifyAdapterError'
  }
}

export class SpotifyCredentialsExpired extends SpotifyAdapterError {
  constructor() {
    super(
      'cookies sp_dc/sp_key expirados ou inválidos (login_required). Renovar: logar em ' +
        'podcasters.spotify.com no browser, copiar os cookies sp_dc e sp_key ' +
        '(DevTools > Application > Cookies) e atualizar SPOTIFY_SP_DC/SPOTIFY_SP_KEY ' +
        'no Secret Manager (prod) ou .env.local (dev).'
    )
    this.name = 'SpotifyCredentialsExpired'
  }
}

// ── auth ─────────────────────────────────────────────────────────────────

function b64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
}

const TokenResponseSchema = z.object({ access_token: z.string(), expires_in: z.number() })

export async function spotifyBearerFromCookies(spDc: string, spKey: string): Promise<string> {
  const state = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())

  const authParams = new URLSearchParams({
    response_type: 'code',
    client_id: WEB_CLIENT_ID,
    scope: 'streaming ugc-image-upload user-read-email user-read-private',
    redirect_uri: 'https://podcasters.spotify.com',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    response_mode: 'web_message',
    prompt: 'none',
  })
  const authResponse = await fetch(
    `https://accounts.spotify.com/oauth2/v2/auth?${authParams}`,
    { headers: { Cookie: `sp_dc=${spDc}; sp_key=${spKey}` } }
  )
  const html = await authResponse.text()
  if (!authResponse.ok) {
    throw new SpotifyAdapterError(`auth request failed: ${authResponse.status}`)
  }
  if (html.includes('login_required')) throw new SpotifyCredentialsExpired()

  // The page embeds a JS object (unquoted keys) — extract the fields we need.
  const codeMatch = html.match(/code:\s*"([^"]+)"/) ?? html.match(/"code":\s*"([^"]+)"/)
  const stateMatch = html.match(/state:\s*"([^"]+)"/) ?? html.match(/"state":\s*"([^"]+)"/)
  if (!codeMatch) {
    throw new SpotifyAdapterError('auth response has no authorization code — API changed?')
  }
  if (stateMatch && stateMatch[1] !== state) {
    throw new SpotifyAdapterError('state mismatch in auth response')
  }

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: WEB_CLIENT_ID,
      code: codeMatch[1],
      redirect_uri: 'https://podcasters.spotify.com',
      code_verifier: verifier,
    }),
  })
  if (!tokenResponse.ok) {
    throw new SpotifyAdapterError(`token exchange failed: ${tokenResponse.status}`)
  }
  return TokenResponseSchema.parse(await tokenResponse.json()).access_token
}

// ── data fetchers ────────────────────────────────────────────────────────

const DetailedStreamsSchema = z.object({
  detailedStreams: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      starts: z.number().int().nonnegative(),
      streams: z.number().int().nonnegative(),
    })
  ),
})

/**
 * `followers` — daily series of the show's TOTAL followers.
 *
 * Proven with a real call in the 31.2 spike (2026-09-04): `start` is REQUIRED
 * (HTTP 400 without it), the series is daily, covers 2021-09-01 onwards, and
 * the source does NOT split gains from losses — it hands the running total.
 * We persist that total as-is; the variation is derived by the reader.
 */
const FollowersSchema = z.object({
  counts: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      count: z.number().int().nonnegative(),
    })
  ),
})

const MetadataSchema = z.object({
  totalEpisodes: z.number().int().nonnegative(),
  streams: z.number().int().nonnegative(),
  followers: z.number().int().nonnegative(),
})

const GenderCountsSchema = z.object({
  counts: z.object({
    MALE: z.number().nonnegative(),
    FEMALE: z.number().nonnegative(),
    NON_BINARY: z.number().nonnegative(),
    NOT_SPECIFIED: z.number().nonnegative(),
  }),
})

const AggregateSchema = z.object({
  count: z.number().nonnegative(),
  ageFacetedCounts: z.record(z.string(), GenderCountsSchema),
  genderedCounts: GenderCountsSchema,
})

async function showGet(
  path: 'detailedStreams' | 'followers' | 'aggregate' | 'metadata',
  bearer: string,
  start?: string,
  end?: string
): Promise<unknown> {
  const range = start && end ? `?start=${start}&end=${end}` : ''
  const url = `${BASE_URL}/shows/${SHOW_ID}/${path}${range}`
  const response = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } })
  if (!response.ok) {
    const body = await response.text()
    throw new SpotifyAdapterError(`${response.status} on ${path}: ${body.slice(0, 200)}`)
  }
  return response.json()
}

/** ≤365-day windows from `start` to `end` — the historical backfill spans
 * ~5 years and a single giant range is an untested bet on the internal API. */
export function yearChunks(start: string, end: string): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = []
  let cursor = new Date(`${start}T00:00:00Z`)
  const limit = new Date(`${end}T00:00:00Z`)
  while (cursor <= limit) {
    const chunkEnd = new Date(cursor)
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 364)
    const effectiveEnd = chunkEnd < limit ? chunkEnd : limit
    chunks.push({
      start: cursor.toISOString().slice(0, 10),
      end: effectiveEnd.toISOString().slice(0, 10),
    })
    cursor = new Date(effectiveEnd)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return chunks
}

// ── transforms ───────────────────────────────────────────────────────────

/** One stored point of `series.spotifyDaily` — the streams axis plus, when the
 * source already has it, the day's TOTAL followers. */
export interface SpotifyDailyPoint {
  date: string
  starts: number
  streams: number
  followers?: number
}

/**
 * Joins the `followers` series onto the `detailedStreams` axis, by date.
 *
 * Single point per day (the two series share the date axis) — two parallel
 * series would drift apart the day one of the two calls fails mid-run.
 * `followers` stays UNDEFINED where the source has no value: the followers
 * series lags the streams one by ~2 days, and writing a 0 or repeating the
 * previous day would invent data.
 *
 * Followers dates with no stream point are reported back (never silently
 * dropped) — with the axis complete since 2021-09-01 this should stay empty.
 */
export function attachFollowers(
  points: Array<{ date: string; starts: number; streams: number }>,
  counts: Array<{ date: string; count: number }>
): { points: SpotifyDailyPoint[]; datesOffAxis: string[] } {
  const followersByDate = new Map(counts.map((c) => [c.date, c.count]))
  const axis = new Set(points.map((p) => p.date))
  return {
    points: points.map((point) => {
      const followers = followersByDate.get(point.date)
      return followers === undefined ? { ...point } : { ...point, followers }
    }),
    datesOffAxis: counts.filter((c) => !axis.has(c.date)).map((c) => c.date),
  }
}

/**
 * Carries a followers value we already stored into a refetched point that came
 * back without one — a re-read of the overlap window must never blank out
 * information already collected (the merge replaces the whole point).
 */
export function keepKnownFollowers(
  stored: SpotifyDailyPoint[],
  fresh: SpotifyDailyPoint[]
): SpotifyDailyPoint[] {
  const known = new Map(
    stored.flatMap((p) => (p.followers === undefined ? [] : [[p.date, p.followers] as const]))
  )
  return fresh.map((point) => {
    if (point.followers !== undefined) return point
    const previous = known.get(point.date)
    return previous === undefined ? point : { ...point, followers: previous }
  })
}

const round1 = (v: number) => Math.round(v * 10) / 10

/** Aggregate age buckets → the donut's 6 buckets (percentages, 1 decimal).
 * `0-17` and unknown buckets are EXCLUDED and the shares renormalized over
 * the displayed buckets (the design shows 18+ only). */
export function ageSharesFromAggregate(
  ageFacets: Record<string, { counts: Record<string, number> }>
): Record<'18-22' | '23-27' | '28-34' | '35-44' | '45-59' | '60+', number> {
  const bucketMap: Record<string, '18-22' | '23-27' | '28-34' | '35-44' | '45-59' | '60+'> = {
    '18-22': '18-22',
    '23-27': '23-27',
    '28-34': '28-34',
    '35-44': '35-44',
    '45-59': '45-59',
    '60-150': '60+',
  }
  const totals = { '18-22': 0, '23-27': 0, '28-34': 0, '35-44': 0, '45-59': 0, '60+': 0 }
  for (const [facet, data] of Object.entries(ageFacets)) {
    const target = bucketMap[facet]
    if (!target) continue
    totals[target] = Object.values(data.counts).reduce((a, b) => a + b, 0)
  }
  const grand = Object.values(totals).reduce((a, b) => a + b, 0)
  if (grand === 0) throw new SpotifyAdapterError('aggregate has zero listeners in age buckets')
  return Object.fromEntries(
    Object.entries(totals).map(([bucket, count]) => [bucket, round1((count / grand) * 100)])
  ) as ReturnType<typeof ageSharesFromAggregate>
}

/** Gendered counts → the donut's 3 shares (NOT_SPECIFIED + NON_BINARY merge). */
export function genderSharesFromAggregate(gendered: {
  counts: Record<'MALE' | 'FEMALE' | 'NON_BINARY' | 'NOT_SPECIFIED', number>
}): { male: number; female: number; notSpecified: number } {
  const { MALE, FEMALE, NON_BINARY, NOT_SPECIFIED } = gendered.counts
  const total = MALE + FEMALE + NON_BINARY + NOT_SPECIFIED
  if (total === 0) throw new SpotifyAdapterError('aggregate has zero gendered listeners')
  return {
    male: round1((MALE / total) * 100),
    female: round1((FEMALE / total) * 100),
    notSpecified: round1(((NON_BINARY + NOT_SPECIFIED) / total) * 100),
  }
}

// ── adapter ──────────────────────────────────────────────────────────────

export const spotifyAdapter: CollectorAdapter = {
  name: 'spotify',
  async collect(): Promise<SectionWrite[]> {
    const spDc = process.env.SPOTIFY_SP_DC
    const spKey = process.env.SPOTIFY_SP_KEY
    if (!spDc || !spKey) {
      throw new SpotifyAdapterError(
        'SPOTIFY_SP_DC/SPOTIFY_SP_KEY não configurados (Secret Manager em prod, .env.local em dev)'
      )
    }

    const bearer = await spotifyBearerFromCookies(spDc, spKey)
    const today = isoToday()

    // Daily streams series — backfill (chunked by year) or incremental.
    const stored = (await readMediakit()).series?.spotifyDaily ?? []
    const startDate = incrementalStart(stored)
    log('INFO', 'Spotify daily series load', {
      mode: stored.length === 0 ? 'backfill' : 'incremental',
      startDate,
    })
    // Both daily series are fetched per chunk and joined on the date axis:
    // streams (starts/streams) and the followers TOTAL of the day. Chunking is
    // kept even though the 5 years fit in one request (2026-09-04 spike) — the
    // internal API may lower that limit without notice.
    const fresh: SpotifyDailyPoint[] = []
    const followersOffAxis: string[] = []
    for (const chunk of yearChunks(startDate, today)) {
      const streamsRaw = await showGet('detailedStreams', bearer, chunk.start, chunk.end)
      const followersRaw = await showGet('followers', bearer, chunk.start, chunk.end)
      const joined = attachFollowers(
        DetailedStreamsSchema.parse(streamsRaw).detailedStreams,
        FollowersSchema.parse(followersRaw).counts
      )
      fresh.push(...joined.points)
      followersOffAxis.push(...joined.datesOffAxis)
    }
    if (followersOffAxis.length > 0) {
      log('WARN', 'Spotify followers dates outside the streams axis (not stored)', {
        count: followersOffAxis.length,
        sample: followersOffAxis.slice(0, 5),
      })
    }

    // Metadata — SOURCE-provided totals (streams parcel for D6 + followers).
    const metadata = MetadataSchema.parse(await showGet('metadata', bearer))

    // Demographics — rolling window (design shows shares, we store raw %).
    const windowStart = new Date()
    windowStart.setUTCDate(windowStart.getUTCDate() - DEMOGRAPHICS_WINDOW_DAYS)
    const aggregateRaw = await showGet(
      'aggregate',
      bearer,
      windowStart.toISOString().slice(0, 10),
      today
    )
    const aggregate = AggregateSchema.parse(aggregateRaw)

    const merged = mergeByDate(stored, keepKnownFollowers(stored, fresh))

    return [
      { section: 'series', partial: { spotifyDaily: merged } },
      {
        section: 'audience',
        partial: {
          followers: { spotify: metadata.followers },
          gender: genderSharesFromAggregate(aggregate.genderedCounts),
          age: ageSharesFromAggregate(aggregate.ageFacetedCounts),
        },
      },
      // Source-provided total (never summed by us) — the D6 parcel.
      { section: 'stats', partial: { viewsSpotifyStreams: metadata.streams } },
    ]
  },
}
