/**
 * API routes for thumbnail generation config images (Epic 22, Story 22.1).
 *
 * POST: Uploads a Base or Referência image to Cloud Storage. Multipart input
 *       with fields `videoType` (`episode` | `cut`), `role` (`base` | `reference`)
 *       and `file`. Returns `{ url, mimeType }` — `url` is the proxy GET URL
 *       persisted in `podcast.prompts.{videoType}.thumbnail.{base|reference}ImageUrl`.
 *
 * GET: Proxy — serves the image from Cloud Storage via ADC using `?path=<filePath>`.
 *      The bucket is NOT public; this route enforces the user session and validates
 *      the path stays inside the `thumbnail-config/` prefix.
 */

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import {
  CloudStorageError,
  downloadThumbnailConfigImage,
  uploadThumbnailConfigImage,
} from '@/lib/firebase/cloud-storage'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

/** Accepted MIME types for thumbnail config uploads. */
const ACCEPTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** Max upload size in bytes (5 MB) — must match the client-side limit. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** Allowed values for the `role` form field. */
const ROLES = new Set(['base', 'reference'])

/** Allowed values for the `videoType` form field. */
const VIDEO_TYPES = new Set(['episode', 'cut'])

export async function POST(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: { message: 'Sessão expirada' } }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (error) {
    log('WARN', 'Thumbnail config: failed to parse multipart form', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json({ error: { message: 'Requisição inválida' } }, { status: 400 })
  }

  const videoType = formData.get('videoType')
  const role = formData.get('role')
  const fileEntry = formData.get('file')

  if (typeof videoType !== 'string' || !VIDEO_TYPES.has(videoType)) {
    return NextResponse.json(
      { error: { message: 'videoType inválido (use episode ou cut)' } },
      { status: 400 }
    )
  }
  if (typeof role !== 'string' || !ROLES.has(role)) {
    return NextResponse.json(
      { error: { message: 'role inválido (use base ou reference)' } },
      { status: 400 }
    )
  }

  // Duck-typing instead of `instanceof File` because the runtime File class
  // differs between Next.js (Node undici) and the vitest jsdom environment.
  const file = fileEntry as { type?: unknown; size?: unknown; arrayBuffer?: unknown } | null
  if (
    !file ||
    typeof file !== 'object' ||
    typeof file.type !== 'string' ||
    typeof file.size !== 'number' ||
    typeof file.arrayBuffer !== 'function'
  ) {
    return NextResponse.json({ error: { message: 'Arquivo não enviado' } }, { status: 400 })
  }
  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: { message: 'Formato inválido. Use PNG, JPEG ou WebP.' } },
      { status: 400 }
    )
  }
  if (file.size === 0) {
    return NextResponse.json({ error: { message: 'Arquivo vazio' } }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: { message: 'Imagem muito grande. Máximo 5 MB.' } },
      { status: 400 }
    )
  }

  try {
    const buffer = Buffer.from(await (file.arrayBuffer as () => Promise<ArrayBuffer>)())
    const { filePath, mimeType } = await uploadThumbnailConfigImage(
      videoType as 'episode' | 'cut',
      role as 'base' | 'reference',
      buffer,
      file.type
    )

    const url = `/api/settings/thumbnail-config?path=${encodeURIComponent(filePath)}`
    return NextResponse.json({ url, mimeType })
  } catch (error) {
    if (error instanceof CloudStorageError) {
      return NextResponse.json({ error: { message: error.message } }, { status: 500 })
    }
    log('ERROR', 'Thumbnail config upload: unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { message: 'Erro inesperado no upload' } },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: { message: 'Sessão expirada' } }, { status: 401 })
  }

  const url = new URL(request.url)
  const filePath = url.searchParams.get('path')
  if (!filePath) {
    return NextResponse.json({ error: { message: 'Parâmetro path ausente' } }, { status: 400 })
  }

  try {
    const buffer = await downloadThumbnailConfigImage(filePath)

    // Detect content type from magic bytes (fallback to png).
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
      return NextResponse.json({ error: { message: error.message } }, { status })
    }
    log('ERROR', 'Thumbnail config download: unexpected error', {
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { message: 'Erro inesperado no download' } },
      { status: 500 }
    )
  }
}
