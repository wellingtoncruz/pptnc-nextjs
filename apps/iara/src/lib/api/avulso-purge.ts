/**
 * Execução comum das mudanças que espurgam o wizard (Epic 25, Adendos A e B):
 * reclassificar o tipo e desmarcar o avulso.
 *
 * Monta o cliente do YouTube do usuário logado, carrega o podcast (canal) e
 * chama `purgeWizardData`; traduz cada recusa em resposta HTTP — nada foi
 * apagado quando a resposta é de erro.
 */
import { NextResponse } from 'next/server'

import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { log } from '@/lib/logger'
import type { Transaction } from 'firebase-admin/firestore'

import { purgeWizardData, WizardPurgeBlockedError } from '@/lib/wizard/purge-wizard-data'
import { VideoLinkedError } from '@/lib/wizard/video-relations'
import { YouTubeAPIError } from '@/lib/youtube'
import { getUserYouTubeClient } from '@/lib/youtube/user-client'
import type { Video } from '@/types/video'

const BLOCK_STATUS: Record<WizardPurgeBlockedError['code'], number> = {
  WIZARD_JOB_RUNNING: 409,
  VIDEO_BUSY: 409,
  YOUTUBE_NOT_VISIBLE: 403,
  WRONG_CHANNEL: 403,
}

export async function runAvulsoPurge(args: {
  podcastId: string
  userId: string
  video: Video
  patch: Record<string, unknown>
  guard?: (tx: Transaction) => Promise<void>
}): Promise<{ ok: true; imagesPurged: boolean } | { ok: false; response: NextResponse }> {
  const { podcastId, userId, video, patch, guard } = args

  const youtube = await getUserYouTubeClient(userId)
  if (!youtube.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: youtube.code, message: youtube.message } },
        { status: youtube.status }
      ),
    }
  }

  const podcast = await getPodcastAdmin(podcastId)
  if (!podcast?.channelId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'PODCAST_NOT_CONFIGURED', message: 'Podcast sem canal configurado' } },
        { status: 500 }
      ),
    }
  }

  try {
    const { imagesPurged } = await purgeWizardData({
      podcastId,
      channelId: podcast.channelId,
      video,
      youtube: youtube.client,
      patch,
      guard,
    })
    return { ok: true, imagesPurged }
  } catch (error) {
    if (error instanceof VideoLinkedError) {
      log('WARN', 'Purge refused: video got linked meanwhile (nothing deleted)', { videoId: video.id })
      return {
        ok: false,
        response: NextResponse.json(
          { error: { code: error.code, message: error.message } },
          { status: 409 }
        ),
      }
    }
    if (error instanceof WizardPurgeBlockedError) {
      log('WARN', 'Avulso purge refused (nothing deleted)', { videoId: video.id, code: error.code })
      return {
        ok: false,
        response: NextResponse.json(
          { error: { code: error.code, message: error.message } },
          { status: BLOCK_STATUS[error.code] }
        ),
      }
    }
    if (error instanceof YouTubeAPIError) {
      log('WARN', 'Avulso purge: YouTube read failed (nothing deleted)', {
        videoId: video.id,
        code: error.code,
      })
      return {
        ok: false,
        response: NextResponse.json(
          { error: { code: error.code, message: error.message } },
          { status: error.status && error.status >= 400 ? error.status : 502 }
        ),
      }
    }
    throw error
  }
}
