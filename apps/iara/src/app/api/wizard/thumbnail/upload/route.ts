/**
 * API routes for the Thumbnail wizard phase — Caminho 2 (Upload manual).
 *
 * Epic 22 / Story 22.3e.
 *
 * POST: Recebe um arquivo PNG/JPEG/WebP (até 2 MB) via multipart e sobe para
 *       `thumbnail-staging/{podcastId}/{videoId}/upload-{ts}.{ext}` no Cloud
 *       Storage. Retorna `{ thumbnailUrl, mimeType }` — `thumbnailUrl` é o
 *       URL do GET-proxy abaixo, que serve a imagem com a sessão validada.
 *
 * GET:  Proxy autenticado para servir arquivos do prefixo `thumbnail-staging/`.
 *       Mesmo pattern do proxy em `/api/settings/thumbnail-config` — o bucket
 *       não é público.
 *
 * Story 22.3g moverá o arquivo selecionado pra o path final + persistirá em
 * `video.storageThumbnailUrl`. Por enquanto a imagem fica em staging.
 */

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import {
  CloudStorageError,
  downloadThumbnailStagingImage,
  uploadThumbnailStagingImage,
} from '@/lib/firebase/cloud-storage'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

/** PNG/JPEG/WebP — YouTube `thumbnails.set` aceita apenas esses. */
const ACCEPTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** 2 MB — limite do YouTube `thumbnails.set`. Mesma constante da story spec. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

/** Pattern restritivo para `videoId` no querystring/form (defesa contra path traversal). */
const SAFE_VIDEO_ID = /^[a-zA-Z0-9_-]+$/

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth()
  if (!session) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (error) {
    log('WARN', 'Thumbnail upload: failed to parse multipart form', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Requisição inválida' } },
      { status: 400 }
    )
  }

  const videoId = formData.get('videoId')
  const fileEntry = formData.get('file')

  if (typeof videoId !== 'string' || !SAFE_VIDEO_ID.test(videoId)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'videoId inválido' } },
      { status: 400 }
    )
  }

  // Duck-typing — runtime File class diverges between Next.js (undici) e vitest jsdom.
  const file = fileEntry as { type?: unknown; size?: unknown; arrayBuffer?: unknown } | null
  if (
    !file ||
    typeof file !== 'object' ||
    typeof file.type !== 'string' ||
    typeof file.size !== 'number' ||
    typeof file.arrayBuffer !== 'function'
  ) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Arquivo não enviado' } },
      { status: 400 }
    )
  }

  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: { code: 'INVALID_FORMAT', message: 'Formato inválido. Use PNG, JPEG ou WebP.' } },
      { status: 400 }
    )
  }
  if (file.size === 0) {
    return NextResponse.json(
      { error: { code: 'EMPTY_FILE', message: 'Arquivo vazio' } },
      { status: 400 }
    )
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: { code: 'FILE_TOO_LARGE', message: 'Imagem muito grande. Máximo 2 MB.' } },
      { status: 400 }
    )
  }

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
          message: 'Upload de thumbnail está disponível apenas para episódios e cortes',
        },
      },
      { status: 400 }
    )
  }

  try {
    const buffer = Buffer.from(await (file.arrayBuffer as () => Promise<ArrayBuffer>)())
    const { filePath, mimeType } = await uploadThumbnailStagingImage(
      videoId,
      'upload',
      buffer,
      file.type as string
    )

    const thumbnailUrl = `/api/wizard/thumbnail/upload?path=${encodeURIComponent(filePath)}`
    return NextResponse.json({ thumbnailUrl, mimeType, filePath, uploadedAt: new Date().toISOString() })
  } catch (error) {
    if (error instanceof CloudStorageError) {
      log('WARN', 'Thumbnail upload: cloud storage error', { videoId, message: error.message })
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 500 }
      )
    }
    log('ERROR', 'Thumbnail upload: unexpected error', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'UPLOAD_FAILED', message: 'Erro inesperado no upload' } },
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
    const buffer = await downloadThumbnailStagingImage(filePath)

    // Magic-bytes sniff — keeps the response Content-Type honest even if a
    // proxy/CDN strips the original on the way in. Defaults to PNG.
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
    log('ERROR', 'Thumbnail upload proxy: unexpected error', {
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'DOWNLOAD_FAILED', message: 'Erro inesperado no download' } },
      { status: 500 }
    )
  }
}
