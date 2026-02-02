'use client'

import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { RefreshCwIcon, UsersIcon, AlertTriangleIcon, CheckCircleIcon } from 'lucide-react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCurrentUser } from '@/hooks/use-current-user'

import { UserCard, type SerializedUser, type UserRole } from './user-card'

interface UsersResponse {
  data: SerializedUser[]
  error?: { code: string; message: string }
}

interface PendingAction {
  type: 'promote' | 'demote' | 'remove'
  userId: string
  userName: string | null
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error?.message ?? 'Erro ao carregar usuários')
  }
  return res.json()
}

/**
 * User list panel component.
 *
 * Displays a list of all users with their information and action buttons.
 * Uses SWR for data fetching with automatic revalidation.
 * Shows loading, error, and empty states appropriately.
 * Includes confirmation dialogs for destructive actions.
 *
 * @see docs/stories/9-4-listagem-usuarios.md
 * @see docs/stories/9-5-acoes-gestao.md
 */
export function UserListPanel() {
  const { user: currentUser } = useCurrentUser()
  const { data, error, isLoading, mutate } = useSWR<UsersResponse>(
    '/api/users',
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    }
  )

  // Loading state per user (for disabling during API calls)
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null)

  // Confirmation dialog state
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  // Feedback message
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const users = data?.data ?? []
  const hasError = !!error
  const hasUsers = users.length > 0

  // Check if only the current user exists (for showing hint message)
  const onlyCurrentUser = users.length === 1 && users[0].id === currentUser?.id

  const handleRetry = () => {
    mutate()
  }

  // Clear feedback after delay
  const showFeedback = useCallback((type: 'success' | 'error', message: string) => {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 4000)
  }, [])

  // Execute role change API call
  const executeRoleChange = useCallback(async (userId: string, newRole: UserRole, userName: string | null) => {
    setLoadingUserId(userId)
    setPendingAction(null)

    try {
      const response = await fetch(`/api/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message ?? 'Erro ao atualizar role')
      }

      // Refresh list
      await mutate()

      const actionText = newRole === 'admin' ? 'promovido a Admin' : 'rebaixado a Usuário'
      showFeedback('success', `${userName ?? 'Usuário'} foi ${actionText}`)
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Erro ao atualizar role')
    } finally {
      setLoadingUserId(null)
    }
  }, [mutate, showFeedback])

  // Execute remove API call
  const executeRemove = useCallback(async (userId: string, userName: string | null) => {
    setLoadingUserId(userId)
    setPendingAction(null)

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message ?? 'Erro ao remover usuário')
      }

      // Refresh list
      await mutate()

      showFeedback('success', `${userName ?? 'Usuário'} foi removido`)
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : 'Erro ao remover usuário')
    } finally {
      setLoadingUserId(null)
    }
  }, [mutate, showFeedback])

  // Handle role change request (from UserCard)
  const handleRoleChangeRequest = useCallback((userId: string, newRole: UserRole) => {
    const user = users.find(u => u.id === userId)
    if (!user) return

    if (newRole === 'admin') {
      // Promotion - execute directly without confirmation
      executeRoleChange(userId, newRole, user.name)
    } else {
      // Demotion - requires confirmation
      setPendingAction({
        type: 'demote',
        userId,
        userName: user.name,
      })
    }
  }, [users, executeRoleChange])

  // Handle remove request (from UserCard)
  const handleRemoveRequest = useCallback((userId: string) => {
    const user = users.find(u => u.id === userId)
    if (!user) return

    setPendingAction({
      type: 'remove',
      userId,
      userName: user.name,
    })
  }, [users])

  // Handle confirmation dialog confirm
  const handleConfirm = useCallback(() => {
    // Prevent double-execution if already loading
    if (!pendingAction || loadingUserId) return

    if (pendingAction.type === 'demote') {
      executeRoleChange(pendingAction.userId, 'user', pendingAction.userName)
    } else if (pendingAction.type === 'remove') {
      executeRemove(pendingAction.userId, pendingAction.userName)
    }
  }, [pendingAction, loadingUserId, executeRoleChange, executeRemove])

  // Handle confirmation dialog cancel
  const handleCancel = useCallback(() => {
    setPendingAction(null)
  }, [])

  // Get dialog content based on pending action
  const getDialogContent = () => {
    if (!pendingAction) return { title: '', description: '' }

    const userName = pendingAction.userName ?? 'este usuário'

    if (pendingAction.type === 'demote') {
      return {
        title: 'Rebaixar usuário',
        description: `Tem certeza que deseja rebaixar ${userName} para Usuário comum? Ele perderá acesso às áreas administrativas.`,
      }
    }

    if (pendingAction.type === 'remove') {
      return {
        title: 'Remover usuário',
        description: `Tem certeza que deseja remover ${userName}? O usuário será desativado e poderá ser reativado se fizer login novamente.`,
      }
    }

    return { title: '', description: '' }
  }

  const dialogContent = getDialogContent()

  // Loading state
  if (isLoading) {
    return (
      <div data-testid="user-list-panel" className="flex h-full flex-col overflow-hidden bg-background">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-6">
          <h2 className="text-lg font-semibold">Usuários</h2>
        </div>
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    )
  }

  // Error state
  if (hasError) {
    return (
      <div data-testid="user-list-panel" className="flex h-full flex-col overflow-hidden bg-background">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-6">
          <h2 className="text-lg font-semibold">Usuários</h2>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <Alert variant="destructive" className="max-w-md">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertTitle>Erro ao carregar usuários</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Erro desconhecido'}
            </AlertDescription>
          </Alert>
          <Button onClick={handleRetry} variant="outline" aria-label="Tentar carregar usuários novamente">
            <RefreshCwIcon className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  // Empty state (no users at all - should not happen normally)
  if (!hasUsers) {
    return (
      <div data-testid="user-list-panel" className="flex h-full flex-col overflow-hidden bg-background">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-6">
          <h2 className="text-lg font-semibold">Usuários</h2>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <UsersIcon className="h-12 w-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-medium">Nenhum usuário cadastrado</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Usuários aparecerão aqui após fazerem seu primeiro login.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Success state with users
  return (
    <>
      <div data-testid="user-list-panel" className="flex h-full flex-col overflow-hidden bg-background">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
          <h2 className="text-lg font-semibold">Usuários</h2>
          <span className="text-sm text-muted-foreground">
            {users.length} {users.length === 1 ? 'usuário' : 'usuários'}
          </span>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div className="shrink-0 px-6 pt-4">
            <Alert variant={feedback.type === 'error' ? 'destructive' : 'default'} className="py-2">
              {feedback.type === 'success' ? (
                <CheckCircleIcon className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangleIcon className="h-4 w-4" />
              )}
              <AlertDescription>{feedback.message}</AlertDescription>
            </Alert>
          </div>
        )}

        <ScrollArea className="flex-1 overflow-hidden">
          <div className="space-y-3 p-6">
            {users.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                isCurrentUser={user.id === currentUser?.id}
                onRoleChange={handleRoleChangeRequest}
                onRemove={handleRemoveRequest}
                isLoading={loadingUserId === user.id}
              />
            ))}
            {/* Hint when only current user exists */}
            {onlyCurrentUser && (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Novos usuários aparecerão aqui após fazerem seu primeiro login.
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => !open && handleCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogContent.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialogContent.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={pendingAction?.type === 'remove' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
