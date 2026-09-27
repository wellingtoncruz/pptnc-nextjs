/**
 * Execução comum das duas mudanças que espurgam o wizard de um avulso
 * (adendo do Epic 25): reclassificar o tipo e desmarcar o avulso.
 *
 * Monta o cliente do YouTube do usuário logado, carrega o podcast (canal) e
 * chama `purgeWizardData`; traduz cada recusa em resposta HTTP — nada foi
 * apagado quando a resposta é de erro.
 */
import { NextResponse } from 'next/server'

import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { log } from '@/lib/logger'
import { purgeWizardData, WizardPurgeBlockedError } from '@/lib/wizard/purge-wizard-data'
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
}): Promise<{ ok: true; imagesPurged: boolean } | { ok: false; response: NextResponse }> {
  const { podcastId, userId, video, patch } = args

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
    })
    return { ok: true, imagesPurged }
  } catch (error) {
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
