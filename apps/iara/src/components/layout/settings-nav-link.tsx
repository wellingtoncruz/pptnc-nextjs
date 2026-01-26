'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Settings navigation link with active state (AC6).
 * Highlights when on /settings page.
 */
export function SettingsNavLink() {
  const pathname = usePathname()
  const isActive = pathname === '/settings'

  return (
    <Link
      href="/settings"
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Settings className="h-4 w-4" />
      Configurações
    </Link>
  )
}
