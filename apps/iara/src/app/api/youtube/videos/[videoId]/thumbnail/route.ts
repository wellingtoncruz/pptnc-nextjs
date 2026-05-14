/**
 * POST /api/youtube/videos/[videoId]/thumbnail — Epic 22 / Story 22.5.
 *
 * Sobe a thumbnail final do vídeo (persistida em `video.storageThumbnailUrl`)
 * pra a YouTube via `client.uploadThumbnail`. Pré-requisitos:
 * - Vídeo já passou pela fase Publicar (`/api/youtube/videos/{id}` PUT) com
 *   sucesso — o `status` precisa estar `sent` ou `sending`.
 * - `storageThumbnailUrl` aponta pra um path GCS via proxy autenticado:
 *   `/api/wizard/thumbnail/select?path=thumbnails/...` (Story 22.3g) ou
 *   `/api/wizard/thumbnail/upload?path=thumbnail-staging/...` (fallback).
 *
 * **TD-5**: vídeos antigos têm `storageThumbnailUrl` como data URL base64
 * (legacy YouTube ingest). Esse formato é ignorado silenciosamente — o
 * endpoint retorna `{ data: { uploaded: false, reason: 'NO_CLOUD_STORAGE_URL' } }`
 * sem erro, pra a UI sinalizar que o produtor precisa gerar/uploadar antes.
 *
 * Resposta:
 * - Sucesso: 200 `{ data: { uploaded: true } }`
 * - Sem thumbnail GCS: 200 `{ data: { uploaded: false, reason: '...' } }`
 * - Erro YouTube API: 4xx/5xx com payload `{ error: { code, message } }`
 *
 * O cliente trata "uploaded: false" como warning não-bloqueante: o vídeo
 * está sent no YouTube com metadados, só sem thumbnail customizada.
 */
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import {
  CloudStorageError,
  downloadThumbnailFinalImage,
  downloadThumbnailStagingImage,
} from '@/lib/firebase/cloud-storage'
import { PODCAST_ID } from '@/lib/firebase/config'
import {
  getUserTokensWithExpiry,
  refreshUserToken,
  TokenRefreshError,
} from '@/lib/firebase/tokens'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import { YouTubeAPIError, YouTubeClient } from '@/lib/youtube'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ videoId: string }>
}

/**
 * Extrai `(path, source)` do URL do proxy autenticado. Retorna `null` para
 * data URLs base64 legacy (TD-5), URLs externas, ou qualquer formato fora dos
 * dois proxies do Epic 22.
 */
function extractGcsPath(
  storageThumbnailUrl: string | undefined
): { path: string; source: 'final' | 'staging' } | null {
  if (!storageThumbnailUrl) return null
  if (storageThumbnailUrl.startsWith('data:')) return null

  const finalMatch = storageThumbnailUrl.match(/\/api\/wizard\/thumbnail\/select\?path=([^&]+)/)
  if (finalMatch) {
    try {
      return { path: decodeURIComponent(finalMatch[1]), source: 'final' }
    } catch {
      return null
    }
  }

  const stagingMatch = storageThumbnailUrl.match(/\/api\/wizard\/thumbnail\/upload\?path=([^&]+)/)
  if (stagingMatch) {
    try {
      return { path: decodeURIComponent(stagingMatch[1]), source: 'staging' }
    } catch {
      return null
    }
  }

  return null
}

/**
 * Detecta o MIME type a partir dos primeiros bytes do arquivo. YouTube
 * `thumbnails.set` exige PNG ou JPEG — WebP é rejeitado.
 */
function sniffMimeType(buffer: Buffer): 'image/png' | 'image/jpeg' | null {
  if (buffer.length < 4) return null
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png'
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'image/jpeg'
  }
  return null
}

export async function POST(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada. Faça login novamente.' } },
      { status: 401 }
    )
  }

  const userId = session.user.id
  const { videoId } = await context.params

  const video = await getVideoAdmin(PODCAST_ID, videoId)
  if (!video) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
      { status: 404 }
    )
  }

  const extracted = extractGcsPath(video.storageThumbnailUrl)
  if (!extracted) {
    // TD-5 legacy base64 or no thumbnail — non-blocking, just inform the client.
    log('INFO', 'Thumbnail upload skipped: no Cloud Storage URL', {
      videoId,
      hasThumbnailUrl: Boolean(video.storageThumbnailUrl),
      isBase64: video.storageThumbnailUrl?.startsWith('data:') ?? false,
    })
    return NextResponse.json({
      data: { uploaded: false, reason: 'NO_CLOUD_STORAGE_URL' },
    })
  }

  // Carrega o buffer do bucket. Tenta o path certo conforme o source detectado.
  let imageBuffer: Buffer
  try {
    imageBuffer =
      extracted.source === 'final'
        ? await downloadThumbnailFinalImage(extracted.path)
        : await downloadThumbnailStagingImage(extracted.path)
  } catch (error) {
    if (error instanceof CloudStorageError) {
      log('WARN', 'Thumbnail upload: storage download failed', {
        videoId,
        path: extracted.path,
        source: extracted.source,
        message: error.message,
      })
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 500 }
      )
    }
    throw error
  }

  const mimeType = sniffMimeType(imageBuffer)
  if (!mimeType) {
    log('WARN', 'Thumbnail upload skipped: unsupported MIME', {
      videoId,
      path: extracted.path,
      firstBytes: imageBuffer.slice(0, 4).toString('hex'),
    })
    return NextResponse.json(
      {
        error: {
          code: 'UNSUPPORTED_MIME',
          message: 'Formato da thumbnail não suportado pelo YouTube (use PNG ou JPEG).',
        },
      },
      { status: 400 }
    )
  }

  // Tokens OAuth do produtor. Mesmo pattern do PUT.
  let tokens = await getUserTokensWithExpiry(userId)
  if (!tokens) {
    return NextResponse.json(
      { error: { code: 'NO_TOKENS', message: 'Tokens OAuth não encontrados. Faça login novamente.' } },
      { status: 401 }
    )
  }
  if (tokens.needsRefresh) {
    if (!tokens.refreshToken) {
      return NextResponse.json(
        { error: { code: 'AUTH_EXPIRED', message: 'Token expirado. Faça login novamente.' } },
        { status: 401 }
      )
    }
    try {
      tokens = await refreshUserToken(userId, tokens.refreshToken)
    } catch (error) {
      if (error instanceof TokenRefreshError) {
        log('ERROR', 'Token refresh failed in thumbnail upload', {
          userId,
          videoId,
          status: error.status,
        })
        return NextResponse.json(
          { error: { code: 'TOKEN_REFRESH_FAILED', message: 'Falha ao renovar token. Faça login novamente.' } },
          { status: 401 }
        )
      }
      throw error
    }
  }

  const client = new YouTubeClient(tokens.accessToken)
  try {
    await client.uploadThumbnail(videoId, imageBuffer, mimeType)
    log('INFO', 'YouTube thumbnail uploaded for video', {
      userId,
      videoId,
      mimeType,
      size: imageBuffer.length,
    })
    return NextResponse.json({ data: { uploaded: true } })
  } catch (error) {
    if (error instanceof YouTubeAPIError) {
      log('WARN', 'YouTube thumbnail upload error', {
        userId,
        videoId,
        code: error.code,
        message: error.message,
        status: error.status,
      })
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status || 500 }
      )
    }
    log('ERROR', 'Unexpected error uploading thumbnail', {
      userId,
      videoId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro interno ao enviar thumbnail.' } },
      { status: 500 }
    )
  }
}
