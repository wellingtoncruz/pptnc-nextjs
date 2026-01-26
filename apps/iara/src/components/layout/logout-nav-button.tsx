'use client'

import { LogOut } from 'lucide-react'
import { signOut } from 'next-auth/react'

/**
 * Visible logout button for the navigation bar.
 * Provides quick access to logout for testing purposes.
 */
export function LogoutNavButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
    >
      <LogOut className="h-4 w-4" />
      Sair
    </button>
  )
}
