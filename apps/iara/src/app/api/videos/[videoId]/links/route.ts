/**
 * PUT /api/videos/[videoId]/links
 *
 * Replaces the full list of reference links attached to an episode (Epic 26).
 *
 * The Links phase of the wizard manages the list client-side (add/edit/remove)
 * and persists the whole array via this endpoint — same field-level replace
 * pattern used for guests/chapters. Links flagged `includeInDescription` are
 * appended deterministically to the YouTube description at publish time.
 *
 * Scope: episodes only (decision Wellington; see ADR-26.2). Cut/reel/standalone
 * are out of scope for this epic.
 *
 * Body: { links: Array<{ url, description, includeInDescription }> }
 *
 * Returns:
 * - Success: { data: { links } }
 * - Error: { error: { code: ErrorCode, message: string } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { PODCAST_ID } from '@/lib/firebase/config'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'
import { LinkSchema } from '@/lib/schemas/video'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

const RequestBodySchema = z.object({
  links: z.array(LinkSchema),
})

interface RouteContext {
  params: Promise<{ videoId: string }>
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessao expirada' } },
      { status: 401 }
    )
  }

  const { videoId } = await context.params

  // Parse and validate request body
  let body: z.infer<typeof RequestBodySchema>
  try {
    const rawBody = await request.json()
    body = RequestBodySchema.parse(rawBody)
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Body invalido: links (array de {url, description, includeInDescription}) obrigatorio' } },
      { status: 400 }
    )
  }

  const { links } = body

  try {
    // 1. Get the current video
    const video = await getVideoAdmin(PODCAST_ID, videoId)

    if (!video) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Video nao encontrado' } },
        { status: 404 }
      )
    }

    // 2. Episode-only scope (ADR-26.2)
    if (video.videoType !== 'episode') {
      return NextResponse.json(
        { error: { code: 'INVALID_VIDEO_TYPE', message: 'Links so podem ser cadastrados em episodios' } },
        { status: 400 }
      )
    }

    // 3. Field-level replace of the whole links array
    await updateVideoAdmin(PODCAST_ID, videoId, { links })

    log('INFO', 'Episode links updated', {
      userId: session.user.id,
      videoId,
      linkCount: links.length,
      includedInDescription: links.filter((l) => l.includeInDescription).length,
    })

    return NextResponse.json({ data: { links } })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    log('ERROR', 'Failed to update episode links', {
      userId: session.user.id,
      videoId,
      error: errorMessage,
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao salvar os links' } },
      { status: 500 }
    )
  }
}
