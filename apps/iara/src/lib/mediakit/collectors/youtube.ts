/**
 * Adapter `youtube` — subscribers + total views (Data API) and watch hours +
 * DAILY watch series (Analytics API).
 *
 * Series rules (architectural correction 2026-08-25):
 * - stored RAW daily (`youtubeWatchDaily` in minutes, the API's unit);
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
import { incrementalStart, isoToday, mergeByDate, SERIES_BACKFILL_START } from './series-utils'

const ChannelStatsSchema = z.object({
  items: z
    .array(
      z.object({
        statistics: z.object({
          viewCount: z.string().regex(/^\d+$/),
          subscriberCount: z.string().regex(/^\d+$/),
        }),
      })
    )
    .min(1),
})

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

    // Data API — public channel statistics (source-provided scalars).
    const statsRaw = await apiGet(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}`,
      accessToken
    )
    const stats = ChannelStatsSchema.parse(statsRaw).items[0].statistics

    // Analytics API — total watch minutes (source-side aggregation, no day dim).
    const totalRaw = await apiGet(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}` +
        `&startDate=${SERIES_BACKFILL_START}&endDate=${today}&metrics=estimatedMinutesWatched`,
      accessToken
    )
    const totalRows = AnalyticsReportSchema.parse(totalRaw).rows ?? []
    const totalMinutes = Number(totalRows[0]?.[0] ?? 0)

    // Analytics API — DAILY series: backfill or incremental with overlap.
    const stored = (await readMediakit()).series?.youtubeWatchDaily ?? []
    const startDate = incrementalStart(stored)
    log('INFO', 'YouTube daily series load', {
      mode: stored.length === 0 ? 'backfill' : 'incremental',
      startDate,
    })
    const dailyRaw = await apiGet(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}` +
        `&startDate=${startDate}&endDate=${today}` +
        `&metrics=estimatedMinutesWatched&dimensions=day&sort=day`,
      accessToken
    )
    const dailyRows = AnalyticsReportSchema.parse(dailyRaw).rows ?? []
    const fresh = dailyRows.map((row) => ({
      date: String(row[0]),
      minutes: Math.max(0, Math.round(Number(row[1]))),
    }))

    return [
      {
        section: 'stats',
        partial: {
          viewsYoutube: Number(stats.viewCount),
          watchHours: Math.round(totalMinutes / 60),
        },
      },
      { section: 'audience', partial: { youtubeSubscribers: Number(stats.subscriberCount) } },
      { section: 'series', partial: { youtubeWatchDaily: mergeByDate(stored, fresh) } },
    ]
  },
}
