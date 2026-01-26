'use client'

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'

interface SessionProviderProps {
  children: React.ReactNode
}

/**
 * Session provider wrapper for client-side session access.
 *
 * Wrap your app with this provider to access session data using:
 * - useSession() hook in client components
 *
 * For server-side session access, use auth() from @/lib/auth instead.
 */
export function SessionProvider({ children }: SessionProviderProps) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
}
