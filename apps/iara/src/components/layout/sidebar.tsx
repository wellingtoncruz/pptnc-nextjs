'use client'

import { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { PanelLeftClose, PanelLeftOpen, Video, FileText, Newspaper, Share2, Megaphone, Users, Settings, Bug, LogOut } from 'lucide-react'
import { signOut } from 'next-auth/react'

import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/version'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrentUser } from '@/hooks/use-current-user'

const STORAGE_KEY = 'sidebar-collapsed'

interface PodcastFeatures {
  editorial?: boolean
  news?: boolean
  socialMedia?: boolean
  adwords?: boolean
  llmDebugMode?: boolean
}

interface SidebarProps {
  userName?: string
  features?: PodcastFeatures
  enabledSocialNetworks?: string[]
}

/**
 * Collapsible sidebar with navigation links.
 * Collapsed state is persisted to localStorage.
 */
export function Sidebar({ userName, features, enabledSocialNetworks }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { isAdmin } = useCurrentUser()

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      setIsCollapsed(stored === 'true')
    }
    setMounted(true)
  }, [])

  // Persist collapsed state to localStorage
  const toggleCollapsed = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem(STORAGE_KEY, String(newState))
  }

  // Filter nav items based on user role
  // Settings is only visible to admins
  const navItems = useMemo(() => {
    // Check if specific views are active via URL param
    const isSettingsView = searchParams.get('view') === 'settings'
    const isUsersView = searchParams.get('view') === 'users'
    const isEditorialView = searchParams.get('view') === 'editorial'
    const isNewsView = searchParams.get('view') === 'news'
    const isSocialView = searchParams.get('view') === 'social'
    const isAdwordsView = searchParams.get('view') === 'adwords'
    const isDebugView = searchParams.get('view') === 'debug'

    const items = [
      {
        href: '/videos',
        label: 'Vídeos',
        icon: Video,
        isActive: (pathname === '/videos' || pathname?.startsWith('/videos/')) && !isSettingsView && !isUsersView && !isEditorialView && !isNewsView && !isSocialView && !isAdwordsView && !isDebugView,
        adminOnly: false,
      },
      ...(features?.editorial !== false ? [{
        // Use ?view=editorial to show editorial section
        href: '/videos?view=editorial',
        label: 'Editorial',
        icon: FileText,
        isActive: isEditorialView,
        adminOnly: false,
      }] : []),
      ...(features?.news !== false ? [{
        // Use ?view=news to show news section
        href: '/videos?view=news',
        label: 'Notícias',
        icon: Newspaper,
        isActive: isNewsView,
        adminOnly: false,
      }] : []),
      ...(features?.socialMedia === true && (enabledSocialNetworks?.length ?? 0) > 0 ? [{
        href: '/videos?view=social',
        label: 'Redes Sociais',
        icon: Share2,
        isActive: isSocialView,
        adminOnly: false,
      }] : []),
      ...(features?.adwords === true ? [{
        href: '/videos?view=adwords',
        label: 'Tráfego Pago',
        icon: Megaphone,
        isActive: isAdwordsView,
        adminOnly: false,
      }] : []),
      {
        // Use ?view=users to show users management
        href: '/videos?view=users',
        label: 'Usuários',
        icon: Users,
        isActive: isUsersView,
        adminOnly: true,
      },
      {
        // Use ?view=settings to keep sidebar visible
        href: '/videos?view=settings',
        label: 'Configurações',
        icon: Settings,
        isActive: isSettingsView,
        adminOnly: true,
      },
      ...(features?.llmDebugMode === true ? [{
        href: '/videos?view=debug',
        label: 'Depuração',
        icon: Bug,
        isActive: isDebugView,
        adminOnly: true,
      }] : []),
    ]

    // Filter out admin-only items for non-admin users
    return items.filter((item) => !item.adminOnly || isAdmin)
  }, [pathname, searchParams, isAdmin, features, enabledSocialNetworks])

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <aside
        data-testid="sidebar"
        className="flex h-full w-48 flex-col border-r border-border bg-background"
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="text-lg font-semibold">IAra</span>
        </div>
      </aside>
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        data-testid="sidebar"
        className={cn(
          'flex h-full flex-col border-r border-border bg-background transition-all duration-200',
          isCollapsed ? 'w-14 collapsed' : 'w-48'
        )}
      >
        {/* Header with title */}
        <div className={cn(
          'flex h-14 items-center border-b border-border',
          isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
        )}>
          {!isCollapsed && <span className="text-lg font-semibold">IAra</span>}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            className="h-8 w-8"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Logo above navigation */}
        <div className={cn(
          'flex items-center justify-center py-4 mb-2',
          isCollapsed ? 'px-1' : 'px-3'
        )}>
          <Link href="/videos">
            <Image
              src="/IAra_logo_backgroud.png"
              alt="IAra"
              width={isCollapsed ? 40 : 160}
              height={isCollapsed ? 40 : 160}
              className="rounded-xl w-full h-auto"
            />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const link = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  item.isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isCollapsed && 'justify-center px-2'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            )

            if (isCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              )
            }

            return link
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-2">
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="flex w-full items-center justify-center rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sair</TooltipContent>
            </Tooltip>
          ) : (
            <>
              {userName && (
                <div className="mb-2 px-3 py-1 text-xs text-muted-foreground truncate">
                  {userName}
                </div>
              )}
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span>Sair</span>
              </button>
            </>
          )}
          {/* Version */}
          <div className={cn(
            'mt-2 text-[10px] text-muted-foreground/60 text-center',
            isCollapsed && 'text-[8px]'
          )}>
            {APP_VERSION}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
