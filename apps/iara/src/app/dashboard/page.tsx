import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { readMediakit } from '@/lib/firebase/mediakit-admin'
import { log } from '@/lib/logger'
import { toWeeks, type WeekSummary } from '@/lib/analytics/weekly'

import { DashboardLayout } from './dashboard-layout'

/**
 * Dashboard — a aba INICIAL da IAra (Epic 31, decisão D5).
 *
 * Rota própria, e não mais um `?view=` sobre `/videos`: decisão do Wellington
 * em 2026-09-04, depois de a arquitetura real vir à tona no planejamento da
 * 31.4 (as dez abas existentes são `?view=` sobre um `videos-layout.tsx` client
 * de 447 linhas — o caso vivo da TD-17). Rota própria permite ler e agregar no
 * SERVIDOR, mandando ao cliente ~64 KB de semanas prontas em vez dos ~300 KiB
 * de série crua (medido na 31.4), e não engorda aquele arquivo.
 *
 * A agregação semanal é do CONSUMIDOR, na leitura (AI 37): o contrato no
 * Firestore segue diário cru. Os três escopos do seletor (D4) são filtro de
 * APRESENTAÇÃO sobre as semanas já formadas — trocar o escopo não refaz busca.
 */

/**
 * Semanas do Spotify: plays SOMADOS (D1 — as duas métricas) + o total de
 * seguidores no ÚLTIMO dia da semana.
 *
 * `followers` é cumulativo: somá-lo daria ~23.450 numa semana de ~3.350
 * seguidores. E é opcional — a série do Spotify tem ~2 dias de defasagem, então
 * a semana corrente costuma chegar sem ele.
 */
export type SpotifyWeek = WeekSummary<'starts' | 'streams', 'followers'>
/** Semanas do YouTube: views + inscritos ganhos e perdidos, SEPARADOS (D2). */
export type YoutubeWeek = WeekSummary<'views' | 'subscribersGained' | 'subscribersLost'>

export interface DashboardData {
  spotify: SpotifyWeek[]
  youtube: YoutubeWeek[]
  /** `true` quando a seção `series` não pôde ser lida — a página avisa, não finge. */
  unavailable: boolean
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session || session.error) {
    redirect('/login')
  }

  const startedAt = Date.now()
  const mediakit = await readMediakit()
  const readMs = Date.now() - startedAt

  const series = mediakit.series
  const aggregateStartedAt = Date.now()
  const data: DashboardData = series
    ? {
        spotify: toWeeks(series.spotifyDaily, {
          sum: ['starts', 'streams'],
          last: ['followers'],
        }),
        youtube: toWeeks(series.youtubeDaily, {
          sum: ['views', 'subscribersGained', 'subscribersLost'],
        }),
        unavailable: false,
      }
    : { spotify: [], youtube: [], unavailable: true }
  const aggregateMs = Date.now() - aggregateStartedAt

  // AC 7 da story 31.4: MEDIR, não intuir. O número decide se o cache com
  // chave `updatedAt` entra (ver "Decisão pendente-de-medição" no épico).
  log('INFO', 'Dashboard data load', {
    readMs,
    aggregateMs,
    spotifyPoints: series?.spotifyDaily.length ?? 0,
    youtubePoints: series?.youtubeDaily.length ?? 0,
    spotifyWeeks: data.spotify.length,
    youtubeWeeks: data.youtube.length,
    unavailable: data.unavailable,
  })

  return <DashboardLayout userName={session.user.name ?? undefined} data={data} />
}
