import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAdmin, requireAuth } from '@/lib/auth/require-admin'
import { listPodcastUsers } from '@/lib/firebase/users-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

/**
 * GET /api/users - List all users for the podcast
 *
 * Requires authentication AND admin role.
 * Returns users sorted by lastAccessAt DESC (most recent first).
 * Excludes soft-deleted users.
 *
 * @see docs/stories/9-4-listagem-usuarios.md
 */
export async function GET() {
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
    const users = await listPodcastUsers(PODCAST_ID)

    // Sort by lastAccessAt DESC (most recent first)
    const sortedUsers = users.sort((a, b) => {
      const aTime = a.lastAccessAt?.toDate?.()?.getTime() ?? 0
      const bTime = b.lastAccessAt?.toDate?.()?.getTime() ?? 0
      return bTime - aTime
    })

    // Serialize timestamps for client (handle optional fields for legacy users)
    const serializedUsers = sortedUsers.map((user) => ({
      ...user,
      picture: user.picture ?? null,
      lastAccessAt: user.lastAccessAt?.toDate?.()?.toISOString() ?? null,
      createdAt: user.createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: user.updatedAt?.toDate?.()?.toISOString() ?? null,
      deleted: user.deleted ?? false,
    }))

    log('INFO', 'Users listed via API', {
      adminId: adminCheck.session.user.id,
      podcastId: PODCAST_ID,
      userCount: serializedUsers.length,
    })

    return NextResponse.json({ data: serializedUsers })
  } catch (error) {
    log('ERROR', 'Failed to list users via API', {
      userId: session!.user.id,
      podcastId: PODCAST_ID,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao listar usuários' } },
      { status: 500 }
    )
  }
}
