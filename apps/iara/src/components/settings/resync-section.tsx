'use client'

import { useState, useCallback, useEffect } from 'react'
import { RefreshCwIcon, AlertTriangleIcon, CheckCircleIcon, Loader2Icon } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

/**
 * Result from the full sync API.
 */
interface FullSyncResult {
  total: number
  updated: number
  added: number
  unchanged: number
}

/**
 * Props for ResyncSection component.
 */
interface ResyncSectionProps {
  /** Whether other settings operations are in progress */
  isPageBusy?: boolean
}

/**
 * Resync section component for the settings page.
 *
 * Provides a button to trigger a full re-sync of all videos from YouTube.
 * Includes confirmation dialog explaining quota implications.
 * Shows loading state during sync and success/error feedback after.
 * Fetches video count when dialog opens to show accurate quota estimate.
 *
 * @see docs/stories/9-6-resync-completo.md
 */
export function ResyncSection({ isPageBusy = false }: ResyncSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [videoCount, setVideoCount] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
    result?: FullSyncResult
  } | null>(null)

  // Fetch video count when dialog opens
  useEffect(() => {
    if (isDialogOpen && videoCount === null) {
      fetch('/api/videos?limit=1')
        .then(res => res.json())
        .then(data => {
          if (data.pagination?.totalCount) {
            setVideoCount(data.pagination.totalCount)
          }
        })
        .catch(() => {
          // Silently fail - dialog will show generic text
        })
    }
  }, [isDialogOpen, videoCount])

  // Calculate estimated API calls
  const estimatedCalls = videoCount ? Math.ceil(videoCount / 50) + 1 : 0

  // Clear feedback after delay
  const showFeedback = useCallback(
    (type: 'success' | 'error', message: string, result?: FullSyncResult) => {
      setFeedback({ type, message, result })
      // Don't auto-clear success with stats - let user see them
      if (type === 'error') {
        setTimeout(() => setFeedback(null), 8000)
      }
    },
    []
  )

  // Handle sync button click - opens confirmation dialog
  const handleSyncClick = useCallback(() => {
    setFeedback(null) // Clear previous feedback
    setIsDialogOpen(true)
  }, [])

  // Handle confirmation
  const handleConfirm = useCallback(async () => {
    setIsDialogOpen(false)
    setIsLoading(true)
    setFeedback(null)

    try {
      const response = await fetch('/api/sync/full', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMessage = data.error?.message ?? 'Erro ao sincronizar vídeos'
        throw new Error(errorMessage)
      }

      const result = data.data as FullSyncResult
      showFeedback(
        'success',
        `Re-sync concluído: ${result.updated} atualizados, ${result.added} novos, ${result.unchanged} sem alterações`,
        result
      )
    } catch (error) {
      showFeedback('error', error instanceof Error ? error.message : 'Erro ao sincronizar vídeos')
    } finally {
      setIsLoading(false)
    }
  }, [showFeedback])

  // Handle dialog cancel
  const handleCancel = useCallback(() => {
    setIsDialogOpen(false)
  }, [])

  // Dismiss feedback manually
  const handleDismissFeedback = useCallback(() => {
    setFeedback(null)
  }, [])

  const isDisabled = isLoading || isPageBusy

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <RefreshCwIcon className="h-5 w-5" />
                Re-sincronização Completa
              </CardTitle>
              <CardDescription>
                Atualiza metadados de todos os vídeos do canal (títulos, descrições, thumbnails)
              </CardDescription>
            </div>
            <Badge variant="destructive" className="shrink-0">
              Alta Quota
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use esta opção quando precisar atualizar informações que mudaram no YouTube
            (títulos editados, descrições atualizadas, etc.). O sync regular busca apenas
            vídeos novos.
          </p>

          {/* Feedback Alert */}
          {feedback && (
            <Alert
              variant={feedback.type === 'error' ? 'destructive' : 'default'}
              className="relative"
            >
              {feedback.type === 'success' ? (
                <CheckCircleIcon className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangleIcon className="h-4 w-4" />
              )}
              <AlertTitle>
                {feedback.type === 'success' ? 'Re-sync concluído' : 'Erro no re-sync'}
              </AlertTitle>
              <AlertDescription>
                {feedback.result ? (
                  <ul className="mt-2 space-y-1">
                    <li>• {feedback.result.total} vídeos processados</li>
                    <li>• {feedback.result.updated} vídeos atualizados</li>
                    <li>• {feedback.result.added} novos vídeos importados</li>
                    <li>• {feedback.result.unchanged} sem alterações</li>
                  </ul>
                ) : (
                  feedback.message
                )}
              </AlertDescription>
              {feedback.type === 'success' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-2 h-6 px-2 text-xs"
                  onClick={handleDismissFeedback}
                >
                  Fechar
                </Button>
              )}
            </Alert>
          )}

          <Button
            variant="destructive"
            onClick={handleSyncClick}
            disabled={isDisabled}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCwIcon className="mr-2 h-4 w-4" />
                Executar Re-sync Completo
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="h-5 w-5 text-orange-500" />
              Confirmar Re-sync Completo
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Esta operação irá buscar e atualizar os metadados de <strong>todos os vídeos</strong> do
                  canal no YouTube.
                </p>
                <div className="rounded-md bg-muted p-3 text-sm">
                  <p className="font-medium text-foreground">Consumo de Quota YouTube API:</p>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {videoCount && videoCount > 0 ? (
                      <>
                        <li>• ~{videoCount} vídeos no canal</li>
                        <li>• ~{estimatedCalls} chamadas de API estimadas</li>
                      </>
                    ) : (
                      <li>• Número de chamadas depende da quantidade de vídeos no canal</li>
                    )}
                    <li>• Esta operação usa significativamente mais quota que o sync regular</li>
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground">
                  Os campos gerenciados pelo IAra (status, conteúdo processado, etc.) serão preservados.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              Confirmar Re-sync
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
