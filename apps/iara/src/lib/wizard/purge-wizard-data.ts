/**
 * Espurgo dos dados gerados pelo wizard — adendo do Epic 25 (2026-09-27).
 *
 * Roda quando um vídeo muda de tipo (reclassificação manual — avulso ou
 * qualquer vídeo sem vínculo, Adendo B) ou deixa de ser avulso: o wizard recomeça do zero no novo formato, e o que o wizard
 * anterior gerou vai embora — inclusive as imagens no bucket.
 *
 * O QUE SOBREVIVE (decisão do Wellington): título, descrição e tags que estão
 * NO YOUTUBE agora — o último envio num vídeo publicado, o original num não
 * publicado. Lidos da API na hora, porque o banco não os guarda: o wizard grava
 * título/descrição/tags escolhidos por cima dos que vieram do YouTube. Também
 * sobrevivem transcrição, embedding, tópicos, convidados e o que não é do
 * wizard (posts sociais, newsletter, adwords).
 *
 * RECUSA INTEIRO, antes de apagar qualquer coisa, quando: há geração do
 * wizard em andamento (um job atrasado regravaria o campo depois do espurgo),
 * o vídeo está em processamento ou sendo publicado, ou o YouTube não devolve o
 * vídeo do canal deste podcast (sem os metadados, não há o que restaurar).
 */
import { FieldValue, type Transaction } from 'firebase-admin/firestore'

import { getAdminDb } from '@/lib/firebase/admin'
import { deleteVideoWizardImages } from '@/lib/firebase/cloud-storage'
import { log } from '@/lib/logger'
import type { Video } from '@/types/video'

/** Campos do vídeo que só o wizard escreve. */
export const WIZARD_GENERATED_FIELDS = [
  'critique',
  'editingIssues',
  'riskAndCompliance',
  'compliance',
  'chapters',
  'links',
  'suggestedTitles',
  'suggestedShortTitles',
  'shortTitle',
  'reviewedPhases',
  'extraImages',
] as const

export type WizardPurgeBlockCode =
  | 'WIZARD_JOB_RUNNING'
  | 'VIDEO_BUSY'
  | 'YOUTUBE_NOT_VISIBLE'
  | 'WRONG_CHANNEL'

export class WizardPurgeBlockedError extends Error {
  constructor(
    public readonly code: WizardPurgeBlockCode,
    message: string
  ) {
    super(message)
    this.name = 'WizardPurgeBlockedError'
  }
}

/** O que o espurgo precisa do YouTube — injetável para teste. */
export interface YoutubeMetadataSource {
  getVideoMetadata(
    videoId: string
  ): Promise<{ title: string; description: string; tags: string[]; channelId: string } | null>
}

export interface PurgeWizardDataInput {
  podcastId: string
  /** Canal do podcast — o vídeo lido do YouTube tem que ser dele. */
  channelId: string
  video: Video
  youtube: YoutubeMetadataSource
  /**
   * Mudança editorial que motivou o espurgo (tipo, flag avulso). Vai na MESMA
   * escrita do espurgo: não existe estado intermediário com tipo novo e dados
   * velhos, nem o inverso.
   */
  patch: Record<string, unknown>
  /**
   * Checagem feita DENTRO da transação da escrita (Adendo B): a elegibilidade
   * foi checada antes, mas outra aba pode ter criado um vínculo no meio. Se
   * lançar, nada é escrito.
   */
  guard?: (tx: Transaction) => Promise<void>
}

/** Thumbnail escolhida no wizard aponta para o proxy dele; a do sync, não. */
function isWizardThumbnailUrl(url: string | undefined): boolean {
  return Boolean(url && /\/api\/wizard\/thumbnail\/(select|upload)\?path=/.test(url))
}

async function assertNoWizardJobRunning(podcastId: string, videoId: string): Promise<void> {
  const snapshot = await getAdminDb()
    .collection('podcasts')
    .doc(podcastId)
    .collection('jobs')
    .where('context.videoId', '==', videoId)
    .get()
  const running = snapshot.docs.some((doc) => {
    const job = doc.data()
    return (
      typeof job.type === 'string' &&
      job.type.startsWith('wizard:') &&
      (job.status === 'pending' || job.status === 'processing')
    )
  })
  if (running) {
    throw new WizardPurgeBlockedError(
      'WIZARD_JOB_RUNNING',
      'Há uma geração do wizard em andamento neste vídeo. Aguarde terminar e tente de novo.'
    )
  }
}

/**
 * Espurga e aplica `patch` numa única escrita. Imagens são apagadas depois:
 * se o bucket falhar, o documento já está consistente e o erro é devolvido em
 * `imagesPurged: false` (arquivo órfão, não dado inconsistente).
 */
export async function purgeWizardData(
  input: PurgeWizardDataInput
): Promise<{ imagesPurged: boolean }> {
  const { podcastId, channelId, video, youtube, patch, guard } = input

  if (video.status === 'processing' || video.status === 'sending') {
    throw new WizardPurgeBlockedError(
      'VIDEO_BUSY',
      'O vídeo está em processamento ou sendo publicado. Aguarde terminar e tente de novo.'
    )
  }
  await assertNoWizardJobRunning(podcastId, video.id)

  const meta = await youtube.getVideoMetadata(video.id)
  if (!meta) {
    throw new WizardPurgeBlockedError(
      'YOUTUBE_NOT_VISIBLE',
      'O YouTube não devolveu este vídeo para a sua conta — sem os metadados do YouTube não há o que restaurar. Entre com uma conta que gerencie o canal.'
    )
  }
  if (meta.channelId !== channelId) {
    throw new WizardPurgeBlockedError(
      'WRONG_CHANNEL',
      'Este vídeo não pertence ao canal configurado do podcast.'
    )
  }

  const update: Record<string, unknown> = {
    title: meta.title,
    description: meta.description,
    tags: meta.tags,
    updatedAt: FieldValue.serverTimestamp(),
  }
  for (const field of WIZARD_GENERATED_FIELDS) update[field] = FieldValue.delete()
  if (isWizardThumbnailUrl(video.storageThumbnailUrl)) {
    update.storageThumbnailUrl = FieldValue.delete()
  }
  // `ready` = wizard concluído; recomeçar o wizard é editar (ready → draft).
  // `sent` continua `sent`: o vídeo segue publicado, com o que está no ar.
  if (video.status === 'ready') update.status = 'draft'
  Object.assign(update, patch)

  const videoRef = getAdminDb()
    .collection('podcasts')
    .doc(podcastId)
    .collection('videos')
    .doc(video.id)
  if (guard) {
    await getAdminDb().runTransaction(async (tx) => {
      await guard(tx)
      tx.update(videoRef, update)
    })
  } else {
    await videoRef.update(update)
  }

  // Resíduo do predecessor dos jobs genéricos (Epic 27): subcoleção por vídeo.
  const legacyJobs = await videoRef.collection('wizardJobs').get()
  await Promise.all(legacyJobs.docs.map((doc) => doc.ref.delete()))

  let imagesPurged = true
  try {
    await deleteVideoWizardImages(video.id)
  } catch (error) {
    imagesPurged = false
    log('ERROR', 'Wizard purge: images left behind (document already purged)', {
      podcastId,
      videoId: video.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }

  log('INFO', 'Wizard data purged', {
    podcastId,
    videoId: video.id,
    patch: Object.keys(patch),
    imagesPurged,
    restoredFromYoutube: true,
  })
  return { imagesPurged }
}
