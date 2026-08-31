/**
 * Adapter `iara-counts` — episode/cut/short numbers of the kit.
 *
 * COUNTING RULE (decisão A1 do Wellington, 2026-08-31):
 * - `episodes` = contagem TOTAL de docs `videoType == 'episode'` no banco
 *   MENOS um offset de 8 (lixo de banco conhecido, sem limpeza por ora);
 * - `cuts`  = episodes × 5 e `shorts` = episodes × 8 — números DERIVADOS
 *   do de episódios por definição de produto, não contados do banco.
 * Conferido contra PROD no dia da decisão: 248 − 8 = 240 → 1.200 / 1.920.
 *
 * Offset e razões são env-overridable (o offset zera quando o lixo for
 * limpo, sem deploy): MEDIAKIT_EPISODE_OFFSET / MEDIAKIT_CUTS_PER_EPISODE /
 * MEDIAKIT_SHORTS_PER_EPISODE.
 */
import { getAdminDb } from '@/lib/firebase/admin'
import { PODCAST_ID } from '@/lib/firebase/config'

import type { CollectorAdapter, SectionWrite } from './runner'

const DEFAULT_EPISODE_OFFSET = 8
const DEFAULT_CUTS_PER_EPISODE = 5
const DEFAULT_SHORTS_PER_EPISODE = 8

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  return Number.isInteger(value) ? value : fallback
}

async function countEpisodes(): Promise<number> {
  const db = getAdminDb()
  const snapshot = await db
    .collection('podcasts')
    .doc(PODCAST_ID)
    .collection('videos')
    .where('videoType', '==', 'episode')
    .count()
    .get()
  return snapshot.data().count
}

export const iaraCountsAdapter: CollectorAdapter = {
  name: 'iara-counts',
  async collect(): Promise<SectionWrite[]> {
    const rawCount = await countEpisodes()
    const episodes = Math.max(0, rawCount - envInt('MEDIAKIT_EPISODE_OFFSET', DEFAULT_EPISODE_OFFSET))
    const cuts = episodes * envInt('MEDIAKIT_CUTS_PER_EPISODE', DEFAULT_CUTS_PER_EPISODE)
    const shorts = episodes * envInt('MEDIAKIT_SHORTS_PER_EPISODE', DEFAULT_SHORTS_PER_EPISODE)
    return [{ section: 'stats', partial: { episodes, cuts, shorts } }]
  },
}
