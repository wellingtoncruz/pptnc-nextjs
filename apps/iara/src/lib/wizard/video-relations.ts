/**
 * Vínculos pai/filho de um vídeo — Adendo B do Epic 25 (2026-10-02).
 *
 * Regra do Wellington: qualquer vídeo SEM vínculo pode ser reclassificado; o
 * avulso proíbe vínculo, então é sempre reclassificável. Marcar avulso exige
 * o vídeo sem vínculo — e não existe "desvincular": corte/reel com pai só
 * troca de pai (PUT /parent).
 *
 * - pai: `parentEpisodeId` do próprio documento;
 * - filhos: vídeos cujo `parentEpisodeId` aponta para este.
 */
import type { Transaction } from 'firebase-admin/firestore'

import { getAdminDb } from '@/lib/firebase/admin'
import type { Video } from '@/types/video'

export interface VideoRelationRef {
  id: string
  title: string
  videoType?: string
}

export interface VideoRelations {
  parent: VideoRelationRef | null
  children: VideoRelationRef[]
}

export function hasRelations(relations: VideoRelations): boolean {
  return relations.parent !== null || relations.children.length > 0
}

/** Avulso é sempre elegível (b⇒a); os demais, só sem vínculo. */
export function canReclassify(video: Pick<Video, 'standalone'>, relations: VideoRelations): boolean {
  return video.standalone === true || !hasRelations(relations)
}

function videosCollection(podcastId: string) {
  return getAdminDb().collection('podcasts').doc(podcastId).collection('videos')
}

export async function getVideoRelations(
  podcastId: string,
  video: Pick<Video, 'id' | 'parentEpisodeId'>
): Promise<VideoRelations> {
  const col = videosCollection(podcastId)

  const [parentSnap, childrenSnap] = await Promise.all([
    video.parentEpisodeId ? col.doc(video.parentEpisodeId).get() : Promise.resolve(null),
    col.where('parentEpisodeId', '==', video.id).select('title', 'videoType').get(),
  ])

  // Pai apagado continua sendo vínculo: o documento ainda aponta para ele.
  const parent: VideoRelationRef | null = video.parentEpisodeId
    ? {
        id: video.parentEpisodeId,
        title: (parentSnap?.get('title') as string | undefined) ?? video.parentEpisodeId,
        videoType: parentSnap?.get('videoType') as string | undefined,
      }
    : null

  const children = childrenSnap.docs.map((doc) => ({
    id: doc.id,
    title: (doc.get('title') as string | undefined) ?? doc.id,
    videoType: doc.get('videoType') as string | undefined,
  }))

  return { parent, children }
}

export class VideoLinkedError extends Error {
  readonly code = 'VIDEO_LINKED' as const
  constructor() {
    super('O vídeo ganhou um vínculo com outro vídeo enquanto a tela estava aberta. Recarregue e tente de novo.')
    this.name = 'VideoLinkedError'
  }
}

/**
 * Trava de corrida, dentro da transação da escrita: a tela checou a
 * elegibilidade ao abrir, mas outra aba pode ter vinculado um corte depois.
 */
export async function assertUnlinkedInTx(
  tx: Transaction,
  podcastId: string,
  videoId: string
): Promise<void> {
  const col = videosCollection(podcastId)
  const [doc, children] = await Promise.all([
    tx.get(col.doc(videoId)),
    tx.get(col.where('parentEpisodeId', '==', videoId).limit(1)),
  ])
  if (doc.get('parentEpisodeId') || !children.empty) throw new VideoLinkedError()
}
