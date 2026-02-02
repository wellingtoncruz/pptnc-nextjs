import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { auth } from '@/lib/auth'
import { requireAdmin, requireAuth } from '@/lib/auth/require-admin'
import { updateUserRole, countAdmins, getPodcastUser } from '@/lib/firebase/users-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

/**
 * Request body schema for updating user role.
 */
const UpdateRoleSchema = z.object({
  role: z.enum(['admin', 'user']),
})

/**
 * PUT /api/users/[userId]/role - Update a user's role
 *
 * Requires authentication AND admin role.
 * Business rules:
 * - Admin cannot change their own role (prevents self-lockout)
 * - Cannot demote the last admin (system must have at least 1 admin)
 *
 * @see docs/stories/9-5-acoes-gestao.md
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
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

  const { userId } = await params

  // Parse and validate request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Corpo da requisição inválido' } },
      { status: 400 }
    )
  }

  const parsed = UpdateRoleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Role inválido. Use "admin" ou "user"' } },
      { status: 400 }
    )
  }

  const { role: newRole } = parsed.data
  const currentUserId = session!.user.id

  try {
    // Rule 1: Admin cannot change their own role
    if (userId === currentUserId) {
      log('WARN', 'Admin attempted to change own role', {
        adminId: currentUserId,
        attemptedRole: newRole,
      })
      return NextResponse.json(
        { error: { code: 'SELF_ACTION_FORBIDDEN', message: 'Não é possível alterar seu próprio role' } },
        { status: 400 }
      )
    }

    // Get target user to check current role
    const targetUser = await getPodcastUser(PODCAST_ID, userId)
    if (!targetUser) {
      return NextResponse.json(
        { error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado' } },
        { status: 404 }
      )
    }

    // Rule 2: Cannot demote the last admin
    if (targetUser.role === 'admin' && newRole === 'user') {
      const adminCount = await countAdmins(PODCAST_ID)
      if (adminCount <= 1) {
        log('WARN', 'Attempted to demote last admin', {
          adminId: currentUserId,
          targetUserId: userId,
        })
        return NextResponse.json(
          { error: { code: 'LAST_ADMIN', message: 'Deve existir pelo menos um administrador' } },
          { status: 400 }
        )
      }
    }

    // Update the role
    await updateUserRole(PODCAST_ID, userId, newRole)

    // Fetch updated user to return
    const updatedUser = await getPodcastUser(PODCAST_ID, userId)

    log('INFO', 'User role updated via API', {
      adminId: currentUserId,
      targetUserId: userId,
      oldRole: targetUser.role,
      newRole: newRole,
    })

    // Serialize timestamps for client
    const serializedUser = updatedUser ? {
      ...updatedUser,
      lastAccessAt: updatedUser.lastAccessAt?.toDate?.()?.toISOString() ?? null,
      createdAt: updatedUser.createdAt?.toDate?.()?.toISOString() ?? null,
      updatedAt: updatedUser.updatedAt?.toDate?.()?.toISOString() ?? null,
    } : null

    return NextResponse.json({ data: serializedUser })
  } catch (error) {
    log('ERROR', 'Failed to update user role via API', {
      adminId: currentUserId,
      targetUserId: userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao atualizar role do usuário' } },
      { status: 500 }
    )
  }
}
