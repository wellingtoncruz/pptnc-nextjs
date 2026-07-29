/**
 * Imagens do episódio no Relatório Editorial — leitura PÚBLICA.
 *
 * `GET /api/report/{videoId}/image?kind=thumbnail|story|vitrine|feed[&download=1]`
 *
 * Sem `auth()`, de propósito: `/report/[videoId]` é público e a decisão do
 * produtor (2026-07-29) foi que as artes acompanhem o resto do relatório, para
 * quem recebe o link conseguir baixá-las. Os proxies do wizard continuam
 * autenticados — esta rota não os substitui.
 *
 * O que mantém isso fechado: o `path` NUNCA vem do cliente. Só o `videoId` e o
 * `kind` vêm, e o arquivo é resolvido a partir da URL gravada no documento do
 * vídeo. Sem isso a rota seria um leitor arbitrário do bucket. As validações de
 * prefixo em `downloadThumbnailFinalImage`/`downloadExtraImageFinal` seguem
 * valendo como segunda barreira.
 *
 * Só episódios: cortes e reels não têm imagens extras e não têm relatório.
 */

import { NextResponse } from 'next/server'

import {
  CloudStorageError,
  downloadExtraImageFinal,
  downloadThumbnailFinalImage,
} from '@/lib/firebase/cloud-storage'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import {
  extractStoredImagePath,
  fileExtensionFromPath,
  getStoredImageUrl,
  isReportImageKind,
} from '@/lib/report/episode-images'

export const runtime = 'nodejs'

/** Mesmo pattern das demais rotas do wizard (defesa contra path traversal). */
const SAFE_VIDEO_ID = /^[a-zA-Z0-9_-]+$/

function notFound(): NextResponse {
  return NextResponse.json(
    { error: { code: 'NOT_FOUND', message: 'Imagem não encontrada' } },
    { status: 404 }
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> }
): Promise<Response> {
  const { videoId } = await params
  const url = new URL(request.url)
  const kind = url.searchParams.get('kind')

  if (!SAFE_VIDEO_ID.test(videoId) || !kind || !isReportImageKind(kind)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Parâmetros inválidos' } },
      { status: 400 }
    )
  }

  let video
  try {
    video = await getVideoAdmin(PODCAST_ID, videoId)
  } catch (error) {
    // ZodError/Firestore — mesma postura da página pública: some, não vaza.
    log('ERROR', 'Report image: failed to load video', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return notFound()
  }

  if (!video || video.videoType !== 'episode') return notFound()

  const filePath = extractStoredImagePath(getStoredImageUrl(video, kind))
  if (!filePath) return notFound()

  try {
    const buffer =
      kind === 'thumbnail'
        ? await downloadThumbnailFinalImage(filePath)
        : await downloadExtraImageFinal(filePath)

    // Magic-bytes sniff, igual aos proxies do wizard: mantém o Content-Type
    // honesto mesmo se o original se perdeu no caminho.
    const bytes = new Uint8Array(buffer.slice(0, 4))
    let contentType = 'image/png'
    if (bytes[0] === 0xff && bytes[1] === 0xd8) contentType = 'image/jpeg'
    else if (bytes[0] === 0x52 && bytes[1] === 0x49) contentType = 'image/webp'

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      // Curto: a URL não muda quando a arte é regerada (o timestamp vive no
      // path interno), então cache longo serviria imagem velha.
      'Cache-Control': 'public, max-age=60',
    }
    if (url.searchParams.get('download') === '1') {
      const ext = fileExtensionFromPath(filePath)
      headers['Content-Disposition'] = `attachment; filename="${videoId}-${kind}.${ext}"`
    }

    return new Response(new Uint8Array(buffer), { headers })
  } catch (error) {
    if (error instanceof CloudStorageError) {
      log('WARN', 'Report image: storage error', { videoId, kind, message: error.message })
      return notFound()
    }
    log('ERROR', 'Report image: unexpected error', {
      videoId,
      kind,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'DOWNLOAD_FAILED', message: 'Erro inesperado no download' } },
      { status: 500 }
    )
  }
}
