'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Linkedin, Loader2, XCircle } from 'lucide-react'

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
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LinkedInConnectionStatus {
  connected: boolean
  configured?: boolean
  targetName?: string | null
  targetId?: string | null
  targetType?: string | null
  expiresAt?: number
  needsRefresh?: boolean
}

/**
 * Social Publish Settings — OAuth connection management for social networks.
 *
 * Currently supports LinkedIn (Company Page). Shows connection status
 * and provides connect/disconnect actions.
 * Uses AlertDialog for disconnect confirmation (project standard).
 */
export function SocialPublishSettings() {
  const [status, setStatus] = useState<LinkedInConnectionStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/linkedin/status')
      if (response.ok) {
        const data = await response.json()
        setStatus(data.data)
      }
    } catch {
      setStatus({ connected: false })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleConnect = useCallback(() => {
    window.location.href = '/api/auth/linkedin/authorize'
  }, [])

  const handleDisconnectConfirm = useCallback(async () => {
    setShowDisconnectDialog(false)
    setIsDisconnecting(true)
    try {
      const response = await fetch('/api/auth/linkedin/disconnect', { method: 'POST' })
      if (response.ok) {
        setStatus({ connected: false })
      }
    } catch {
      // Silently fail
    } finally {
      setIsDisconnecting(false)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Conecte suas contas de redes sociais para habilitar o agendamento de publicações.
        </p>

        {/* LinkedIn Card */}
        <div className={cn(
          'rounded-lg border p-4 space-y-3',
          status?.connected ? 'border-green-500/30' : 'border-border'
        )}>
          <div className="flex items-center gap-3">
            <Linkedin className="size-5 text-blue-500" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold">
                LinkedIn {status?.targetType === 'page' ? '(Página)' : '(Perfil)'}
              </h4>
              {status?.connected ? (
                <div className="flex items-center gap-1 text-xs text-green-400">
                  <CheckCircle2 className="size-3" />
                  Conectado: {status.targetName}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Não conectado</p>
              )}
            </div>
          </div>

          {status?.connected ? (
            <div className="flex items-center gap-2">
              {status.needsRefresh && (
                <p className="text-xs text-yellow-400 flex items-center gap-1">
                  <XCircle className="size-3" />
                  Token expirado — reconecte sua conta
                </p>
              )}
              {status.expiresAt && !status.needsRefresh && (
                <p className="text-xs text-muted-foreground">
                  Token válido até {new Date(status.expiresAt * 1000).toLocaleDateString('pt-BR')}
                </p>
              )}
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDisconnectDialog(true)}
                disabled={isDisconnecting}
                className="text-xs"
              >
                {isDisconnecting ? <Loader2 className="size-3 animate-spin mr-1" /> : null}
                Desconectar
              </Button>
            </div>
          ) : status?.configured === false ? (
            <p className="text-xs text-yellow-400">
              LinkedIn OAuth não configurado. Defina as variáveis de ambiente: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI.
            </p>
          ) : (
            <Button
              size="sm"
              onClick={handleConnect}
              className="w-full"
            >
              <ExternalLink className="size-3 mr-1" />
              Conectar LinkedIn
            </Button>
          )}
        </div>
      </div>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-orange-500" />
              Desconectar LinkedIn
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ao desconectar, todos os agendamentos pendentes para LinkedIn serão cancelados automaticamente.
              Você precisará reconectar para agendar novas publicações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter conexão</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnectConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
