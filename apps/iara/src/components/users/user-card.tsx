'use client'

import { useState } from 'react'
import Image from 'next/image'
import { MoreVerticalIcon, ShieldIcon, ShieldOffIcon, TrashIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Serialized user data from API (timestamps as ISO strings).
 * Some fields are optional to support legacy users.
 */
export interface SerializedUser {
  id: string
  email: string
  name: string | null
  picture?: string | null
  role: 'admin' | 'user'
  lastAccessAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  deleted?: boolean
}

export type UserRole = 'admin' | 'user'

interface UserCardProps {
  user: SerializedUser
  isCurrentUser?: boolean
  /** Callback when role change is requested. Called with userId and new role. */
  onRoleChange?: (userId: string, newRole: UserRole) => void
  /** Callback when user removal is requested. Called with userId. */
  onRemove?: (userId: string) => void
  /** Whether actions are currently loading for this user. */
  isLoading?: boolean
}

/**
 * Formats a date as relative time in Portuguese.
 * Examples: "agora", "há 5 min", "há 2h", "há 3d"
 *
 * Handles edge cases:
 * - null/undefined returns "nunca"
 * - Future dates (clock skew) return "agora"
 */
function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'nunca'

  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // Handle future dates (clock skew between client/server)
  if (diff < 0) return 'agora'

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  if (hours < 24) return `há ${hours}h`
  if (days < 30) return `há ${days}d`
  return `há ${Math.floor(days / 30)} meses`
}

/**
 * Gets initials from a name (up to 2 characters).
 */
function getInitials(name: string | null): string {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * User card component for displaying user information in a list.
 *
 * Shows avatar (image or initials), name, email, role badge, and last access time.
 * Highlights the current user with a "(você)" indicator.
 * Includes action menu for non-current users (promote, demote, remove).
 *
 * Note: Avatar images come from Google OAuth (lh3.googleusercontent.com).
 * This domain must be configured in next.config.ts remotePatterns.
 */
export function UserCard({
  user,
  isCurrentUser = false,
  onRoleChange,
  onRemove,
  isLoading = false,
}: UserCardProps) {
  const [imageError, setImageError] = useState(false)

  const showInitials = !user.picture || imageError
  const showActions = !isCurrentUser && (onRoleChange || onRemove)

  const handlePromote = () => {
    onRoleChange?.(user.id, 'admin')
  }

  const handleDemote = () => {
    onRoleChange?.(user.id, 'user')
  }

  const handleRemove = () => {
    onRemove?.(user.id)
  }

  return (
    <div
      data-testid={`user-card-${user.id}`}
      className={cn(
        'flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors',
        isCurrentUser && 'ring-1 ring-primary/50',
        isLoading && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Avatar */}
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
        {!showInitials ? (
          <Image
            src={user.picture!}
            alt={user.name ?? user.email}
            fill
            className="object-cover"
            sizes="48px"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
            {getInitials(user.name)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">
            {user.name ?? 'Sem nome'}
          </span>
          {isCurrentUser && (
            <span className="shrink-0 text-xs text-muted-foreground">(você)</span>
          )}
        </div>
        <span className="truncate text-sm text-muted-foreground">
          {user.email}
        </span>
      </div>

      {/* Role Badge */}
      <Badge
        variant={user.role === 'admin' ? 'default' : 'secondary'}
        className={cn(
          'shrink-0',
          user.role === 'admin' && 'bg-green-600 hover:bg-green-600'
        )}
      >
        {user.role === 'admin' ? 'Admin' : 'Usuário'}
      </Badge>

      {/* Last Access */}
      <div className="shrink-0 text-right">
        <div className="text-xs text-muted-foreground">Último acesso</div>
        <div className="text-sm">{formatRelativeTime(user.lastAccessAt)}</div>
      </div>

      {/* Actions Menu - only for non-current users */}
      {showActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8"
              disabled={isLoading}
              aria-label={`Ações para ${user.name ?? user.email}`}
            >
              <MoreVerticalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Role change actions */}
            {onRoleChange && (
              <>
                {user.role === 'user' ? (
                  <DropdownMenuItem onClick={handlePromote}>
                    <ShieldIcon className="mr-2 h-4 w-4" />
                    Promover a Admin
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleDemote}>
                    <ShieldOffIcon className="mr-2 h-4 w-4" />
                    Rebaixar a Usuário
                  </DropdownMenuItem>
                )}
              </>
            )}
            {/* Remove action */}
            {onRemove && (
              <>
                {onRoleChange && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={handleRemove}
                >
                  <TrashIcon className="mr-2 h-4 w-4" />
                  Remover usuário
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
