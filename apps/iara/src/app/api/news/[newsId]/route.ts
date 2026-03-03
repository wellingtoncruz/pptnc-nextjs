/**
 * GET /api/news/[newsId] — Fetch single news document
 * PATCH /api/news/[newsId] — Partial update (selected_video, social)
 *
 * @see Story 18.4, 18.5
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getNewsById, updateNewsFields } from '@/lib/firebase/news-admin'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

const PatchBodySchema = z.object({
  selected_video: z.string().optional(),
  social: z.string().nullable().optional(),
}).strict().refine(
  (data) => data.selected_video !== undefined || data.social !== undefined,
  { message: 'Pelo menos selected_video ou social deve ser informado' }
)

interface RouteContext {
  params: Promise<{ newsId: string }>
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()
  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { newsId } = await context.params

  if (!newsId || typeof newsId !== 'string') {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'newsId inválido' } },
      { status: 400 }
    )
  }

  try {
    const news = await getNewsById(PODCAST_ID, newsId)
    if (!news) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Notícia não encontrada' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: news })
  } catch (error) {
    log('ERROR', 'Failed to get news', { newsId, error: error instanceof Error ? error.message : 'Unknown' })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao buscar notícia' } },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  const { newsId } = await context.params

  try {
    const rawBody = await request.json().catch(() => null)
    if (rawBody === null) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Body JSON inválido' } },
        { status: 400 }
      )
    }
    const bodyResult = PatchBodySchema.safeParse(rawBody)

    if (!bodyResult.success) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: bodyResult.error.issues[0]?.message || 'Body inválido' } },
        { status: 400 }
      )
    }

    const updateData: { selected_video?: string; social?: string | null } = {}

    if (bodyResult.data.selected_video !== undefined) {
      updateData.selected_video = bodyResult.data.selected_video
    }
    if (bodyResult.data.social !== undefined) {
      updateData.social = bodyResult.data.social
    }

    await updateNewsFields(PODCAST_ID, newsId, updateData)

    return NextResponse.json({
      data: { updatedAt: new Date().toISOString() },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to update news', {
      podcastId: PODCAST_ID,
      newsId,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao atualizar notícia' } },
      { status: 500 }
    )
  }
}
