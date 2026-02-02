'use client'

import { useSession } from 'next-auth/react'

/**
 * Hook for accessing current user data with role information.
 *
 * Returns the authenticated user's data from the session,
 * including their role for authorization checks.
 *
 * @example
 * ```tsx
 * const { user, isAdmin, isLoading } = useCurrentUser()
 *
 * if (isLoading) return <Loading />
 * if (!user) return <LoginPrompt />
 * if (!isAdmin) return <AccessDenied />
 * ```
 *
 * @see docs/stories/8-1-modelo-roles-permissoes.md
 */
export function useCurrentUser() {
  const { data: session, status } = useSession()

  const user = session?.user ?? null
  const isLoading = status === 'loading'
  const isAuthenticated = status === 'authenticated' && !!user
  const isAdmin = user?.role === 'admin'

  return {
    /** The current authenticated user, or null if not logged in */
    user,
    /** Whether the user has admin role */
    isAdmin,
    /** Whether the session is still loading */
    isLoading,
    /** Whether the user is authenticated */
    isAuthenticated,
    /** The session status: 'loading' | 'authenticated' | 'unauthenticated' */
    status,
    /** The user's role, or undefined if not authenticated */
    role: user?.role,
    /** Session error if any (e.g., RefreshAccessTokenError) */
    error: session?.error,
  }
}
