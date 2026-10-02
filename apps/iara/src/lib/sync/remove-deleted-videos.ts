/**
 * Remoção, no sync, dos vídeos que não existem mais no YouTube (out/2026).
 *
 * Só roda com `features.syncRemovesDeletedVideos` ligada — o PPTNC deixa
 * desligada (o sync nunca apaga nada); o TrenDs News liga. Decisões do
 * Wellington (2026-10-02):
 *
 * - **Só remove se quem sincroniza é a conta do canal.** O sync lê a playlist
 *   de uploads com o token de quem clicou: uma conta sem acesso ao canal não
 *   enxerga os vídeos privados, que pareceriam apagados. Conta errada → nada é
 *   removido e o resultado avisa quantos ficaram pendentes.
 * - **Apaga de vez**: documento + subcoleções + arquivos do vídeo no bucket.
 * - **Vídeo com vínculo pai/filho não é removido**: entra no aviso; o produtor
 *   resolve (reaponta os filhos) e o próximo sync remove. O mesmo vale para
 *   vídeo em processamento/envio ou com geração em andamento — apagar no meio
 *   deixaria um job escrevendo num documento que não existe mais.
 *
 * A lista de IDs do YouTube só chega aqui se a playlist foi lida INTEIRA (o
 * sync lança antes em qualquer falha de paginação) — leitura parcial nunca
 * vira remoção.
 */
import { deleteAllVideoImages } from '@/lib/firebase/cloud-storage'
import { getAdminDb } from '@/lib/firebase/admin'
import { log } from '@/lib/logger'
import { getVideoRelations, hasRelations } from '@/lib/wizard/video-relations'

export interface RemovedVideoRef {
  id: string
  title: string
}

export interface SkippedRemoval extends RemovedVideoRef {
  reason: 'linked' | 'busy'
}

export interface RemovalResult {
  removed: RemovedVideoRef[]
  skipped: SkippedRemoval[]
  /**
   * Quantos sumiram do YouTube mas NÃO foram avaliados porque a conta que
   * sincronizou não é a do canal. 0 quando a remoção rodou.
   */
  pendingWrongAccount: number
}

/** Contrato mínimo do cliente do YouTube — injetável para teste. */
export interface ChannelOwnershipSource {
  listMyChannelIds(): Promise<string[]>
}

const BUSY_STATUSES = new Set(['processing', 'sending'])

async function hasRunningJob(podcastId: string, videoId: string): Promise<boolean> {
  const snapshot = await getAdminDb()
    .collection('podcasts')
    .doc(podcastId)
    .collection('jobs')
    .where('context.videoId', '==', videoId)
    .get()
  return snapshot.docs.some((doc) => {
    const status = doc.get('status')
    return status === 'pending' || status === 'processing'
  })
}

export async function removeVideosGoneFromYouTube(args: {
  podcastId: string
  channelId: string
  youtube: ChannelOwnershipSource
  existingIds: Set<string>
  /** TODOS os IDs da playlist de uploads, lida até a última página. */
  youtubeIds: Set<string>
}): Promise<RemovalResult> {
  const { podcastId, channelId, youtube, existingIds, youtubeIds } = args
  const result: RemovalResult = { removed: [], skipped: [], pendingWrongAccount: 0 }

  const candidates = [...existingIds].filter((id) => !youtubeIds.has(id))
  if (candidates.length === 0) return result

  const myChannels = await youtube.listMyChannelIds()
  if (!myChannels.includes(channelId)) {
    result.pendingWrongAccount = candidates.length
    log('WARN', 'Sync removal skipped: account is not the podcast channel', {
      podcastId,
      candidates: candidates.length,
    })
    return result
  }

  const videos = getAdminDb().collection('podcasts').doc(podcastId).collection('videos')

  for (const id of candidates) {
    const ref = videos.doc(id)
    const snap = await ref.get()
    if (!snap.exists) continue
    const title = (snap.get('title') as string | undefined) ?? id
    const parentEpisodeId = snap.get('parentEpisodeId') as string | undefined

    const relations = await getVideoRelations(podcastId, { id, parentEpisodeId })
    if (hasRelations(relations)) {
      result.skipped.push({ id, title, reason: 'linked' })
      continue
    }
    if (BUSY_STATUSES.has(snap.get('status')) || (await hasRunningJob(podcastId, id))) {
      result.skipped.push({ id, title, reason: 'busy' })
      continue
    }

    await getAdminDb().recursiveDelete(ref)
    try {
      await deleteAllVideoImages(id)
    } catch (error) {
      // O documento já saiu: sobra arquivo órfão no bucket, não dado inconsistente.
      log('ERROR', 'Sync removal: images left behind', {
        podcastId,
        videoId: id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    result.removed.push({ id, title })
  }

  log('INFO', 'Videos gone from YouTube processed', {
    podcastId,
    removed: result.removed.length,
    skipped: result.skipped.length,
  })
  return result
}
