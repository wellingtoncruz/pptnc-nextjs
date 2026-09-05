/**
 * Adapter `youtube` — subscribers, total views, watch hours and DAILY series
 * (watch minutes + views), tudo via Analytics API (a mesma fonte do Studio).
 *
 * Series rules (architectural correction 2026-08-25):
 * - stored RAW daily (`youtubeDaily`: `minutes` e `views`, as unidades da
 *   própria API — a agregação é problema do consumidor);
 * - HISTORICAL BACKFILL from the launch month when the stored series is
 *   empty; INCREMENTAL afterwards, refetching the last OVERLAP_DAYS so
 *   late-arriving data overwrites by date;
 * - `watchHours` is the SOURCE-provided total (query without day dimension),
 *   never summed by us.
 *
 * Auth: the producer's stored OAuth (podcasts/{id}/users/{userId}/tokens),
 * refreshed when expired. ⚠️ The Analytics calls need the
 * `yt-analytics.readonly` scope — absent from the current consent
 * (verified 2026-08-26); until the re-consent happens they fail loudly and
 * the runner isolates this adapter's failure.
 */
import { z } from 'zod'

import { getAdminDb } from '@/lib/firebase/admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { readMediakit } from '@/lib/firebase/mediakit-admin'
import { getUserTokens, saveUserTokens } from '@/lib/firebase/tokens'
import { isTokenExpired, refreshAccessToken } from '@/lib/auth/refresh-token'
import { log } from '@/lib/logger'

import type { CollectorAdapter, SectionWrite } from './runner'
import {
  incrementalStart,
  isBackfillForced,
  isoToday,
  mergeByDate,
  SERIES_BACKFILL_START,
} from './series-utils'

/**
 * Janela "desde sempre" das métricas vitalícias: delta exato de inscritos
 * (Σ gained − lost) e `views`.
 *
 * `2005-01-01` é uma data-sentinela — antecede a fundação do YouTube, logo
 * antecede qualquer canal. Não é a data do canal: o primeiro vídeo do PPTNC é
 * de 2021-09-05, quatro dias depois do `SERIES_BACKFILL_START`. Como não há
 * conteúdo anterior, a soma das `views` diárias da série deve fechar com o
 * `viewsYoutube` vitalício — divergência aqui é sintoma, não arredondamento.
 */
const ANALYTICS_LIFETIME_SINCE = '2005-01-01'

const AnalyticsReportSchema = z.object({
  rows: z.array(z.array(z.union([z.string(), z.number()]))).optional(),
})

export class YoutubeAdapterError extends Error {
  constructor(message: string) {
    super(`youtube adapter: ${message}`)
    this.name = 'YoutubeAdapterError'
  }
}

/** Producer's user id: env override, else the single user holding tokens. */
async function resolveUserId(): Promise<string> {
  const fromEnv = process.env.MEDIAKIT_YOUTUBE_USER_ID
  if (fromEnv) return fromEnv

  const db = getAdminDb()
  const users = await db.collection('podcasts').doc(PODCAST_ID).collection('users').get()
  for (const doc of users.docs) {
    const tokens = await getUserTokens(doc.id)
    if (tokens?.refreshToken) return doc.id
  }
  throw new YoutubeAdapterError(
    'no user with stored OAuth tokens found (set MEDIAKIT_YOUTUBE_USER_ID or sign in)'
  )
}

async function resolveAccessToken(): Promise<string> {
  const userId = await resolveUserId()
  const tokens = await getUserTokens(userId)
  if (!tokens) throw new YoutubeAdapterError(`no tokens for user ${userId}`)

  if (!isTokenExpired(tokens.expiresAt)) return tokens.accessToken

  if (!tokens.refreshToken) {
    throw new YoutubeAdapterError(`token expired and no refresh token for user ${userId}`)
  }
  const refreshed = await refreshAccessToken(tokens.refreshToken)
  await saveUserTokens(userId, {
    accessToken: refreshed.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: refreshed.expiresAt,
  })
  log('INFO', 'YouTube token refreshed for mediakit collector', { userId })
  return refreshed.accessToken
}

async function apiGet(url: string, accessToken: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) {
    const body = await response.text()
    throw new YoutubeAdapterError(`${response.status} on ${url.split('?')[0]}: ${body.slice(0, 300)}`)
  }
  return response.json()
}

export const youtubeAdapter: CollectorAdapter = {
  name: 'youtube',
  async collect(): Promise<SectionWrite[]> {
    // Admin read on purpose — lib/firebase/podcasts.ts is the CLIENT SDK and
    // demands NEXT_PUBLIC_* envs the job doesn't have.
    const podcastDoc = await getAdminDb().collection('podcasts').doc(PODCAST_ID).get()
    const channelId = podcastDoc.data()?.channelId as string | undefined
    if (!channelId) throw new YoutubeAdapterError('podcast has no channelId')
    const accessToken = await resolveAccessToken()
    const today = isoToday()

    // Subscribers + views via Analytics vitalício (decisões Wellington
    // 2026-08-31 e 2026-09-02: a verdade é o Studio, que exibe o Analytics).
    // Subscribers: Σ(subscribersGained − subscribersLost) ≈ Studio com desvio
    // mínimo (purgas não geram evento de perda), contra −70 do subscriberCount
    // arredondado. Views: o viewCount público da Data API roda ~420 mil ABAIXO
    // do Analytics (pipelines de auditoria distintos; conteúdo removido sai do
    // contador público mas fica no histórico do Analytics).
    const lifetimeRaw = await apiGet(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}` +
        `&startDate=${ANALYTICS_LIFETIME_SINCE}&endDate=${today}` +
        `&metrics=subscribersGained,subscribersLost,views`,
      accessToken
    )
    const lifetimeRows = AnalyticsReportSchema.parse(lifetimeRaw).rows ?? []
    const subscribers = Math.max(
      0,
      Number(lifetimeRows[0]?.[0] ?? 0) - Number(lifetimeRows[0]?.[1] ?? 0)
    )
    const viewsYoutube = Math.max(0, Number(lifetimeRows[0]?.[2] ?? 0))

    // Analytics API — total watch minutes (source-side aggregation, no day dim).
    const totalRaw = await apiGet(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}` +
        `&startDate=${SERIES_BACKFILL_START}&endDate=${today}&metrics=estimatedMinutesWatched`,
      accessToken
    )
    const totalRows = AnalyticsReportSchema.parse(totalRaw).rows ?? []
    const totalMinutes = Number(totalRows[0]?.[0] ?? 0)

    // Analytics API — DAILY series: backfill or incremental with overlap.
    const stored = (await readMediakit()).series?.youtubeDaily ?? []
    const startDate = incrementalStart(stored)
    log('INFO', 'YouTube daily series load', {
      mode: stored.length === 0 || isBackfillForced() ? 'backfill' : 'incremental',
      forced: isBackfillForced(),
      startDate,
    })
    const dailyRaw = await apiGet(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}` +
        `&startDate=${startDate}&endDate=${today}` +
        `&metrics=estimatedMinutesWatched,views&dimensions=day&sort=day`,
      accessToken
    )
    const dailyRows = AnalyticsReportSchema.parse(dailyRaw).rows ?? []
    const fresh = dailyRows.map((row) => ({
      date: String(row[0]),
      minutes: Math.max(0, Math.round(Number(row[1]))),
      views: Math.max(0, Math.round(Number(row[2]))),
    }))

    return [
      {
        section: 'stats',
        partial: {
          viewsYoutube,
          watchHours: Math.round(totalMinutes / 60),
        },
      },
      { section: 'audience', partial: { youtubeSubscribers: subscribers } },
      { section: 'series', partial: { youtubeDaily: mergeByDate(stored, fresh) } },
    ]
  },
}
