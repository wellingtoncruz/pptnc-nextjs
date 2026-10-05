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
 * A playlist de uploads NÃO é prova de que um vídeo sumiu. Incidente de
 * 02/10/2026 (TrenDs): lida até a última página com o token do dono, ela
 * devolveu 1930 entradas com ~113 repetidas e deixou de listar 108 vídeos que
 * existem — e a versão anterior apagou os 108. Agora a playlist só aponta
 * CANDIDATOS; cada candidato é confirmado pelo ID (videos.list, com o mesmo
 * token do dono, que enxerga privados) e só sai o que o YouTube não devolve.
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
   * Fora da playlist de uploads, mas o YouTube ainda devolve pelo ID — a
   * playlist veio incompleta. Não são removidos.
   */
  missingFromPlaylist: number
  /**
   * Quantos sumiram do YouTube mas NÃO foram avaliados porque a conta que
   * sincronizou não é a do canal. 0 quando a remoção rodou.
   */
  pendingWrongAccount: number
}

/** Contrato mínimo do cliente do YouTube — injetável para teste. */
export interface ChannelOwnershipSource {
  listMyChannelIds(): Promise<string[]>
  /** videos.list por ID (lotes de 50) — devolve só os que existem para o token. */
  getVideoDetailsBatch(videoIds: string[]): Promise<Array<{ id: string }>>
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
  const result: RemovalResult = { removed: [], skipped: [], missingFromPlaylist: 0, pendingWrongAccount: 0 }

  const playlistCandidates = [...existingIds].filter((id) => !youtubeIds.has(id))
  if (playlistCandidates.length === 0) return result

  const myChannels = await youtube.listMyChannelIds()
  if (!myChannels.includes(channelId)) {
    result.pendingWrongAccount = playlistCandidates.length
    log('WARN', 'Sync removal skipped: account is not the podcast channel', {
      podcastId,
      candidates: playlistCandidates.length,
    })
    return result
  }

  // Prova de que sumiu: o YouTube não devolve o vídeo pelo ID (1 unidade a cada 50).
  const stillThere = new Set((await youtube.getVideoDetailsBatch(playlistCandidates)).map((v) => v.id))
  const candidates = playlistCandidates.filter((id) => !stillThere.has(id))
  result.missingFromPlaylist = playlistCandidates.length - candidates.length
  if (result.missingFromPlaylist > 0) {
    log('WARN', 'Uploads playlist incomplete: videos still on YouTube kept', {
      podcastId,
      missingFromPlaylist: result.missingFromPlaylist,
      confirmedGone: candidates.length,
    })
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
    missingFromPlaylist: result.missingFromPlaylist,
  })
  return result
}
