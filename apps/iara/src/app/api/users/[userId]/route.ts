import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { requireAdmin, requireAuth } from '@/lib/auth/require-admin'
import { softDeleteUser, countAdmins, getPodcastUser } from '@/lib/firebase/users-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { log } from '@/lib/logger'

export const runtime = 'nodejs'

/**
 * DELETE /api/users/[userId] - Soft delete a user
 *
 * Requires authentication AND admin role.
 * Business rules:
 * - Admin cannot delete themselves (prevents self-lockout)
 * - Cannot delete the last admin (system must have at least 1 admin)
 * - Uses soft-delete (sets deleted=true) so user can be reactivated on next login
 *
 * @see docs/stories/9-5-acoes-gestao.md
 */
export async function DELETE(
  _request: NextRequest,
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
  const currentUserId = session!.user.id

  try {
    // Rule 1: Admin cannot delete themselves
    if (userId === currentUserId) {
      log('WARN', 'Admin attempted to delete self', {
        adminId: currentUserId,
      })
      return NextResponse.json(
        { error: { code: 'SELF_ACTION_FORBIDDEN', message: 'Não é possível remover a si mesmo' } },
        { status: 400 }
      )
    }

    // Get target user to check if exists and their role
    const targetUser = await getPodcastUser(PODCAST_ID, userId)
    if (!targetUser) {
      return NextResponse.json(
        { error: { code: 'USER_NOT_FOUND', message: 'Usuário não encontrado' } },
        { status: 404 }
      )
    }

    // Rule 2: Cannot delete the last admin
    if (targetUser.role === 'admin') {
      const adminCount = await countAdmins(PODCAST_ID)
      if (adminCount <= 1) {
        log('WARN', 'Attempted to delete last admin', {
          adminId: currentUserId,
          targetUserId: userId,
        })
        return NextResponse.json(
          { error: { code: 'LAST_ADMIN', message: 'Não é possível remover o único administrador' } },
          { status: 400 }
        )
      }
    }

    // Soft delete the user
    await softDeleteUser(PODCAST_ID, userId)

    log('INFO', 'User deleted via API', {
      adminId: currentUserId,
      targetUserId: userId,
      targetEmail: targetUser.email,
      targetRole: targetUser.role,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    log('ERROR', 'Failed to delete user via API', {
      adminId: currentUserId,
      targetUserId: userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Erro ao remover usuário' } },
      { status: 500 }
    )
  }
}
