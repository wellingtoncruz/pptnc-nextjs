import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'

import { auth } from '@/lib/auth'
import { requireAdmin, requireAuth } from '@/lib/auth/require-admin'
import { getPodcastAdmin, updatePodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { PodcastUpdateSchema } from '@/lib/schemas'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

/**
 * GET /api/podcast - Get podcast settings
 *
 * Requires authentication. Returns the current tenant's podcast.
 */
export async function GET() {
  const session = await auth()

  if (!session || session.error) {
    return NextResponse.json(
      { error: { code: 'AUTH_EXPIRED', message: 'Sessão expirada' } },
      { status: 401 }
    )
  }

  try {
    const podcast = await getPodcastAdmin(PODCAST_ID)

    if (!podcast) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Podcast não encontrado' } },
        { status: 404 }
      )
    }

    // Serialize timestamps for client
    const serialized = {
      ...podcast,
      createdAt: podcast.createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: podcast.updatedAt?.toDate?.()?.toISOString() ?? null,
    }

    return NextResponse.json({ data: serialized })
  } catch (error) {
    log('ERROR', 'Failed to get podcast via API', {
      userId: session.user.id,
      podcastId: PODCAST_ID,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao carregar podcast' } },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/podcast - Update podcast settings
 *
 * Requires authentication AND admin role.
 * Updates the current tenant's podcast.
 *
 * @see docs/stories/8-1-modelo-roles-permissoes.md
 */
export async function PATCH(request: NextRequest) {
  const session = await auth()

  // Check for authentication
  const authError = requireAuth(session)
  if (authError) {
    return authError
  }

  // Check for admin role
  const adminCheck = requireAdmin(session!)
  if (!adminCheck.authorized) {
    return adminCheck.response
  }

  try {
    const body = await request.json()

    // Validate with Zod
    const validated = PodcastUpdateSchema.parse(body)

    // Update using Admin SDK
    await updatePodcastAdmin(PODCAST_ID, validated)

    log('INFO', 'Podcast updated via API', {
      userId: adminCheck.session.user.id,
      podcastId: PODCAST_ID,
      fields: Object.keys(validated),
    })

    return NextResponse.json({ data: { success: true } })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos' } },
        { status: 400 }
      )
    }

    log('ERROR', 'Failed to update podcast via API', {
      userId: session!.user.id,
      podcastId: PODCAST_ID,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao atualizar podcast' } },
      { status: 500 }
    )
  }
}
