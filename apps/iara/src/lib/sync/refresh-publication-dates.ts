/**
 * Data efetiva de publicação, atualizada no sync (out/2026).
 *
 * O sync delta só CRIA vídeos: `publishedAt` e `youtubePrivacyStatus` ficam
 * congelados no dia em que o vídeo entrou. Um vídeo agendado depois disso — ou
 * publicado dias depois do upload — seguia ordenado pela data do upload.
 * Medido em PROD (10/10/2026): 4 agendados fora de posição e 333 vídeos com a
 * data gravada de 1 a 30 dias mais antiga que a real.
 *
 * Decisão do Wellington (2026-10-10): exceção restrita à regra "sync nunca
 * modifica vídeo existente". A cada sync, os vídeos que o banco ainda dá como
 * não públicos são relidos pelo ID e têm atualizados SÓ `effectivePublishedAt`
 * e `youtubePrivacyStatus`. O `status` da IAra e o `publishedAt` (lido pelo
 * site público) não são tocados. Vídeo que vira público sai do conjunto.
 *
 * Vídeo que o YouTube não devolve fica como está: ausência não é mudança (a
 * conta de quem sincroniza pode não enxergar os privados do canal).
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

import { getAdminDb } from '@/lib/firebase/admin'
import { log } from '@/lib/logger'
import type { YouTubeVideoDataFromAPI } from '@/lib/youtube/client'

const BATCH_SIZE = 400

export interface DatesRefreshResult {
  /** Vídeos não públicos no banco, relidos do YouTube. */
  checked: number
  updated: number
  /** A releitura falhou; o resto do sync seguiu e as datas ficaram como estavam. */
  failed?: boolean
}

/** Agendamento do YouTube, se houver; senão, a data real de publicação. */
export function effectivePublishedAt(video: Pick<YouTubeVideoDataFromAPI, 'publishedAt' | 'publishAt'>): Date {
  const scheduled = video.publishAt ? new Date(video.publishAt) : null
  if (scheduled && !Number.isNaN(scheduled.getTime())) return scheduled
  return new Date(video.publishedAt)
}

function toMillis(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as Timestamp).toMillis === 'function') {
    return (value as Timestamp).toMillis()
  }
  return null
}

export async function refreshPublicationDates(params: {
  podcastId: string
  youtube: { getVideoDetailsBatch(videoIds: string[]): Promise<YouTubeVideoDataFromAPI[]> }
}): Promise<DatesRefreshResult> {
  const { podcastId, youtube } = params
  const db = getAdminDb()
  const videosRef = db.collection('podcasts').doc(podcastId).collection('videos')

  let checked = 0
  let updated = 0
  try {
    const snapshot = await videosRef
      .where('youtubePrivacyStatus', 'in', ['private', 'unlisted'])
      .select('youtubePrivacyStatus', 'effectivePublishedAt')
      .get()
    checked = snapshot.size

    const stored = new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]))
    // videos.list: 50 IDs por chamada, 1 unidade de quota cada.
    const live = await youtube.getVideoDetailsBatch(Array.from(stored.keys()))

    let batch = db.batch()
    let batchCount = 0
    for (const ytVideo of live) {
      const current = stored.get(ytVideo.id)
      if (!current) continue
      const effective = effectivePublishedAt(ytVideo)
      if (Number.isNaN(effective.getTime())) continue
      if (
        current.youtubePrivacyStatus === ytVideo.privacyStatus &&
        toMillis(current.effectivePublishedAt) === effective.getTime()
      ) {
        continue
      }
      batch.update(videosRef.doc(ytVideo.id), {
        effectivePublishedAt: Timestamp.fromDate(effective),
        youtubePrivacyStatus: ytVideo.privacyStatus,
        visibilityUpdatedAt: FieldValue.serverTimestamp(),
      })
      updated++
      if (++batchCount >= BATCH_SIZE) {
        await batch.commit()
        batch = db.batch()
        batchCount = 0
      }
    }
    if (batchCount > 0) await batch.commit()

    log('INFO', 'Publication dates refreshed', { podcastId, checked, updated })
    return { checked, updated }
  } catch (error) {
    // O que o sync tinha de criar já foi criado; a ordem da lista não justifica derrubá-lo.
    log('ERROR', 'Failed to refresh publication dates', {
      podcastId,
      checked,
      updated,
      error: error instanceof Error ? error.message : String(error),
    })
    return { checked, updated, failed: true }
  }
}
