/**
 * Admin authorization helper for API routes.
 *
 * Validates that the authenticated user has admin role.
 * Returns a standardized error response if not authorized.
 *
 * @see docs/stories/8-1-modelo-roles-permissoes.md
 */

import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'

import { log } from '@/lib/logger'

/**
 * Result of admin authorization check.
 */
export type RequireAdminResult =
  | { authorized: true; session: Session }
  | { authorized: false; response: NextResponse }

/**
 * Checks if the session user has admin role.
 *
 * @param session - The current session (from auth())
 * @returns Authorization result with either the session (if authorized) or an error response
 *
 * @example
 * ```ts
 * const session = await auth()
 * if (!session || session.error) {
 *   return NextResponse.json({ error: { code: 'AUTH_EXPIRED' } }, { status: 401 })
 * }
 *
 * const adminCheck = requireAdmin(session)
 * if (!adminCheck.authorized) {
 *   return adminCheck.response
 * }
 *
 * // User is admin, proceed with the operation
 * const { session: adminSession } = adminCheck
 * ```
 */
export function requireAdmin(session: Session): RequireAdminResult {
  // Check if user has admin role
  if (session.user.role !== 'admin') {
    log('WARN', 'Admin access denied', {
      userId: session.user.id,
      role: session.user.role,
    })

    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Admin access required',
          },
        },
        { status: 403 }
      ),
    }
  }

  return {
    authorized: true,
    session,
  }
}

/**
 * Checks if the session is valid (authenticated and no errors).
 *
 * @param session - The current session (from auth())
 * @returns An error response if not authenticated, or null if valid
 */
export function requireAuth(
  session: Session | null
): NextResponse | null {
  if (!session || session.error) {
    return NextResponse.json(
      {
        error: {
          code: 'AUTH_EXPIRED',
          message: 'Sessão expirada',
        },
      },
      { status: 401 }
    )
  }

  return null
}
