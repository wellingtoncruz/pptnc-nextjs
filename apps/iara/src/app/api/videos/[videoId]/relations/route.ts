/**
 * GET /api/videos/[videoId]/relations — Adendo B do Epic 25 (2026-10-02).
 *
 * Vínculos pai/filho do vídeo e se ele pode ser reclassificado. A tela usa
 * para decidir se mostra o controle de tipo (só elegíveis) e para explicar,
 * no bloqueio do avulso, qual vínculo impede.
 *
 * Returns: { data: { parent, children, canReclassify } }
 */
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin } from '@/lib/firebase/videos-admin'
import { log } from '@/lib/logger'
import { canReclassify, getVideoRelations } from '@/lib/wizard/video-relations'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ videoId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { videoId } = await context.params

  try {
    const video = await getVideoAdmin(PODCAST_ID, videoId)
    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vídeo não encontrado' } },
        { status: 404 }
      )
    }
    const relations = await getVideoRelations(PODCAST_ID, video)
    return NextResponse.json({ data: { ...relations, canReclassify: canReclassify(video, relations) } })
  } catch (error) {
    log('ERROR', 'Failed to read video relations', {
      videoId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao ler os vínculos do vídeo' } },
      { status: 500 }
    )
  }
}
