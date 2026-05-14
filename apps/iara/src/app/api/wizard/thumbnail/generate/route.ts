/**
 * STUB endpoint for Story 22.3c — Caminho 1 (Gerar com IAra).
 *
 * Returns a placeholder SVG data URL after a short simulated delay so the
 * wizard's progressive temporal feedback (timer + 30s/60s messages) can be
 * exercised end-to-end without burning Vertex AI quota.
 *
 * Story 22.4 replaces this with the real `runAsyncPhase` pattern:
 * fire-and-forget + Firestore status polling + reference image composition.
 * The shape of the success response (`{ thumbnailUrl }`) is intentionally
 * close to what 22.4 will emit, so the client-side wiring in PhaseThumbnail
 * does not have to change again.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  videoId: z.string().min(1, 'videoId é obrigatório'),
  observation: z.string().max(2000).optional(),
  /**
   * URL (proxy autenticado) da foto do convidado já cropada. Usada como
   * reference image extra na chamada ao LLM em Story 22.4. O stub atual
   * apenas valida e registra — não influencia o mock SVG.
   */
  guestPhotoUrl: z.string().url().or(z.string().startsWith('/api/')).optional(),
})

const STUB_DELAY_MS = Number(process.env.THUMBNAIL_STUB_DELAY_MS ?? 4000)

function buildPlaceholderDataUrl(title: string, observation: string | undefined): string {
  const safeTitle = (title || 'Sem título').replace(/[<>&]/g, '').slice(0, 60)
  const safeObservation = (observation ?? '').replace(/[<>&]/g, '').slice(0, 80)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f2937"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <text x="640" y="320" text-anchor="middle" fill="#f97316" font-family="sans-serif" font-size="64" font-weight="bold">STUB · Thumbnail mock</text>
  <text x="640" y="400" text-anchor="middle" fill="#e2e8f0" font-family="sans-serif" font-size="36">${safeTitle}</text>
  <text x="640" y="470" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="24">${safeObservation || 'sem observação'}</text>
  <text x="640" y="640" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="20">Story 22.4 substitui este stub pela geração real via Vertex AI</text>
</svg>`
  const base64 = Buffer.from(svg, 'utf-8').toString('base64')
  return `data:image/svg+xml;base64,${base64}`
}

/**
 * POST /api/wizard/thumbnail/generate
 *
 * Body: `{ videoId, observation? }`
 * Returns: `{ thumbnailUrl, generatedAt }` after `STUB_DELAY_MS`.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
  const { videoId, observation, guestPhotoUrl } = parsed.data

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
          message: 'Geração de thumbnail está disponível apenas para episódios e cortes',
        },
      },
      { status: 400 }
    )
  }

  log('INFO', 'Thumbnail stub generation started', {
    videoId,
    videoType: video.videoType,
    hasObservation: Boolean(observation),
    hasGuestPhoto: Boolean(guestPhotoUrl),
    delayMs: STUB_DELAY_MS,
  })

  if (STUB_DELAY_MS > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, STUB_DELAY_MS))
  }

  const thumbnailUrl = buildPlaceholderDataUrl(video.title ?? '', observation)
  const generatedAt = new Date().toISOString()

  log('INFO', 'Thumbnail stub generation completed', { videoId, generatedAt })

  return NextResponse.json({ thumbnailUrl, generatedAt })
}
