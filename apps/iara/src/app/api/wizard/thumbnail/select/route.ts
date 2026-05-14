/**
 * Persistência da thumbnail selecionada — Epic 22 / Story 22.3g.
 *
 * POST: Recebe `{ videoId, selectedThumbnailUrl }` (a URL pode ser do staging
 *       de uma geração ou upload manual). Copia o arquivo de
 *       `thumbnail-staging/...` para `thumbnails/{podcastId}/{videoId}/final.{ext}`
 *       e atualiza `video.storageThumbnailUrl` no Firestore com o URL do
 *       proxy do final. Idempotente: se a URL já apontar para o path final,
 *       só atualiza o Firestore (sem copy).
 *
 * GET:  Proxy autenticado para servir o final. Path-validated pro prefixo
 *       `thumbnails/{podcastId}/`.
 *
 * Esta é a única story que liga staging com Firestore. O histórico de
 * versões geradas/uploadadas continua efêmero (decisão Wellington em
 * 2026-05-14) — só a thumbnail selecionada sobrevive ao refresh.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import {
  CloudStorageError,
  copyThumbnailStagingToFinal,
  downloadThumbnailFinalImage,
} from '@/lib/firebase/cloud-storage'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

const SAFE_VIDEO_ID = /^[a-zA-Z0-9_-]+$/

const RequestSchema = z.object({
  videoId: z.string().min(1, 'videoId é obrigatório').regex(SAFE_VIDEO_ID, 'videoId inválido'),
  /** URL atual da thumbnail (proxy `/api/wizard/thumbnail/upload?path=...` ou já `/select?path=...`). */
  selectedThumbnailUrl: z.string().min(1, 'selectedThumbnailUrl é obrigatório'),
})

/**
 * Extrai o `path` GCS do URL do proxy. Aceita tanto o proxy de upload (staging)
 * quanto o do select (final). Retorna `null` se a URL não bate com nenhum.
 */
function extractGcsPath(thumbnailUrl: string): string | null {
  if (thumbnailUrl.startsWith('data:')) return null
  const match = thumbnailUrl.match(/\/api\/wizard\/thumbnail\/(?:upload|select)\?path=([^&]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Corpo da requisição inválido' } },
      { status: 400 }
    )
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Dados de requisição inválidos' } },
      { status: 400 }
    )
  }
  const { videoId, selectedThumbnailUrl } = parsed.data

  const video = await getVideoAdmin(PODCAST_ID, videoId)
  if (!video) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
      { status: 404 }
    )
  }
  if (video.videoType !== 'episode' && video.videoType !== 'cut') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_VIDEO_TYPE',
          message: 'Persistência de thumbnail está disponível apenas para episódios e cortes',
        },
      },
      { status: 400 }
    )
  }

  const gcsPath = extractGcsPath(selectedThumbnailUrl)
  if (!gcsPath) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_URL',
          message:
            'URL de thumbnail inválida. Geração e upload no wizard são pré-requisitos para persistir.',
        },
      },
      { status: 400 }
    )
  }

  try {
    const { filePath: finalPath } = await copyThumbnailStagingToFinal(gcsPath, videoId)
    const finalUrl = `/api/wizard/thumbnail/select?path=${encodeURIComponent(finalPath)}`

    await updateVideoAdmin(PODCAST_ID, videoId, {
      storageThumbnailUrl: finalUrl,
    })

    log('INFO', 'Thumbnail final persisted', { videoId, finalPath })
    return NextResponse.json({ thumbnailUrl: finalUrl, finalPath })
  } catch (error) {
    if (error instanceof CloudStorageError) {
      log('WARN', 'Thumbnail select: storage error', { videoId, message: error.message })
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 500 }
      )
    }
    log('ERROR', 'Thumbnail select: unexpected error', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'SELECT_FAILED', message: 'Erro inesperado ao persistir thumbnail' } },
      { status: 500 }
    )
  }
}

export async function GET(request: Request): Promise<Response> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const url = new URL(request.url)
  const filePath = url.searchParams.get('path')
  if (!filePath) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Parâmetro path ausente' } },
      { status: 400 }
    )
  }

  try {
    const buffer = await downloadThumbnailFinalImage(filePath)
    const bytes = new Uint8Array(buffer.slice(0, 4))
    let contentType = 'image/png'
    if (bytes[0] === 0xff && bytes[1] === 0xd8) contentType = 'image/jpeg'
    else if (bytes[0] === 0x52 && bytes[1] === 0x49) contentType = 'image/webp'

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    if (error instanceof CloudStorageError) {
      const status = error.code === 'DOWNLOAD_FAILED' ? 404 : 500
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status }
      )
    }
    log('ERROR', 'Thumbnail final proxy: unexpected error', {
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'DOWNLOAD_FAILED', message: 'Erro inesperado no download' } },
      { status: 500 }
    )
  }
}
