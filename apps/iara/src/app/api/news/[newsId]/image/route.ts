/**
 * GET /api/news/[newsId]/image
 *
 * Proxy — serves the stored news image from Cloud Storage via ADC.
 * The bucket is NOT public; images are accessed server-side with ADC
 * and streamed to the authenticated client.
 *
 * @see Story 18.9 — Notícias Imagem — API Route SSE + Prompt Builder
 */

import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import {
  authExpiredResponse,
  createErrorResponse,
  notFoundResponse,
} from '@/lib/api/video-field-handler'
import { PODCAST_ID } from '@/lib/firebase/config'
import {
  downloadNewsImage,
  CloudStorageError,
} from '@/lib/firebase/cloud-storage'
import { getNewsById } from '@/lib/firebase/news-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ newsId: string }>
}

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse | Response> {
  const session = await auth()
  if (!session) {
    return authExpiredResponse()
  }

  const { newsId } = await context.params

  try {
    const news = await getNewsById(PODCAST_ID, newsId)
    if (!news?.imageUrl) {
      return notFoundResponse('Imagem da notícia')
    }

    const imageBuffer = await downloadNewsImage(news.imageUrl)

    // Detect image format from magic bytes
    const bytes = new Uint8Array(imageBuffer instanceof Buffer ? imageBuffer : imageBuffer.slice(0, 4))
    let contentType = 'image/png'
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) contentType = 'image/jpeg'
    else if (bytes[0] === 0x52 && bytes[1] === 0x49) contentType = 'image/webp'

    return new Response(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    if (error instanceof CloudStorageError) {
      log('ERROR', 'Failed to proxy news image', {
        newsId,
        code: error.code,
        message: error.message,
      })
      return createErrorResponse('STORAGE_ERROR', 'Imagem não encontrada no storage', 404)
    }

    log('ERROR', 'Failed to proxy news image', {
      newsId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return createErrorResponse('INTERNAL_ERROR', 'Erro ao carregar imagem da notícia', 500)
  }
}
