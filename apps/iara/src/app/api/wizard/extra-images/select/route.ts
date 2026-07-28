/**
 * Persistência da imagem extra selecionada — Epic 28 / Story 28.4.
 *
 * POST: recebe `{ videoId, kind, selectedImageUrl }`, copia o arquivo de
 *       `thumbnail-staging/...` para `extra-images/{podcast}/{videoId}/{kind}-{ts}.{ext}`
 *       e grava a URL do proxy em `video.extraImages.{kind}`.
 *
 * GET:  proxy autenticado do final, path-validated para `extra-images/{podcast}/`.
 *
 * O update faz **merge sobre o `extraImages` lido do próprio documento**, não
 * sobre o que o cliente mandou: as três imagens são selecionadas de forma
 * independente, e confiar no cliente faria salvar Story apagar Vitrine e Feed
 * caso a aba estivesse com estado antigo. Dot-path (`extraImages.story`) não
 * serve aqui — `updateVideoAdmin` valida com `VideoUpdateSchema.parse`, que
 * descartaria a chave.
 *
 * Como no Epic 22, o histórico de versões geradas continua efêmero — só a
 * imagem selecionada sobrevive ao refresh.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import {
  CloudStorageError,
  copyExtraImageStagingToFinal,
  downloadExtraImageFinal,
} from '@/lib/firebase/cloud-storage'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import { EXTRA_IMAGE_KINDS } from '@/lib/schemas/podcast'

export const runtime = 'nodejs'

const SAFE_VIDEO_ID = /^[a-zA-Z0-9_-]+$/

const RequestSchema = z.object({
  videoId: z.string().min(1, 'videoId é obrigatório').regex(SAFE_VIDEO_ID, 'videoId inválido'),
  kind: z.enum(EXTRA_IMAGE_KINDS),
  /** URL do proxy de staging (`/api/wizard/thumbnail/upload?path=...`) ou já do final. */
  selectedImageUrl: z.string().min(1, 'selectedImageUrl é obrigatório'),
})

/** Extrai o path GCS do proxy de staging (upload) ou do final (extra-images). */
function extractGcsPath(imageUrl: string): string | null {
  if (imageUrl.startsWith('data:')) return null
  const match = imageUrl.match(
    /\/api\/wizard\/(?:thumbnail\/upload|extra-images\/select)\?path=([^&]+)/
  )
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
  const { videoId, kind, selectedImageUrl } = parsed.data

  const video = await getVideoAdmin(PODCAST_ID, videoId)
  if (!video) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
      { status: 404 }
    )
  }
  if (video.videoType !== 'episode') {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_VIDEO_TYPE',
          message: 'Imagens extras estão disponíveis apenas para episódios',
        },
      },
      { status: 400 }
    )
  }

  const gcsPath = extractGcsPath(selectedImageUrl)
  if (!gcsPath) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_URL',
          message:
            'URL de imagem inválida. Geração e upload no wizard são pré-requisitos para persistir.',
        },
      },
      { status: 400 }
    )
  }

  try {
    const { filePath: finalPath } = await copyExtraImageStagingToFinal(gcsPath, videoId, kind)
    const finalUrl = `/api/wizard/extra-images/select?path=${encodeURIComponent(finalPath)}`

    // Merge sobre o estado persistido — preserva as outras duas imagens.
    await updateVideoAdmin(PODCAST_ID, videoId, {
      extraImages: { ...(video.extraImages ?? {}), [kind]: finalUrl },
    })

    log('INFO', 'Extra image persisted', { videoId, kind, finalPath })
    return NextResponse.json({ imageUrl: finalUrl, kind, finalPath })
  } catch (error) {
    if (error instanceof CloudStorageError) {
      log('WARN', 'Extra image select: storage error', { videoId, kind, message: error.message })
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 500 }
      )
    }
    log('ERROR', 'Extra image select: unexpected error', {
      videoId,
      kind,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'SELECT_FAILED', message: 'Erro inesperado ao persistir a imagem' } },
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
    const buffer = await downloadExtraImageFinal(filePath)
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
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status })
    }
    log('ERROR', 'Extra image proxy: unexpected error', {
      filePath,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'DOWNLOAD_FAILED', message: 'Erro inesperado no download' } },
      { status: 500 }
    )
  }
}
