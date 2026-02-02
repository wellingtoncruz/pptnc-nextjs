'use client'

import { useEffect, useCallback } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Sync result data for the modal.
 *
 * Note: Transcriptions are no longer fetched during sync (Story 5.6).
 * They are fetched on-demand when the producer selects a video.
 */
export interface SyncResultData {
  /** Number of new videos found */
  newVideos: number
  /** Number of videos that returned to editing */
  reopenedVideos: number
}

interface SyncResultModalProps {
  isOpen: boolean
  onClose: () => void
  result?: SyncResultData | null
  error?: string | null
}

/**
 * Modal that displays the result of a video sync operation.
 *
 * Shows:
 * - Number of new videos found
 * - Number of videos that returned to editing
 * - General error message if sync failed
 *
 * Note: Transcriptions are no longer fetched during sync (Story 5.6).
 */
export function SyncResultModal({ isOpen, onClose, result, error }: SyncResultModalProps) {
  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  // Don't render if not open
  if (!isOpen) return null

  // Error state
  if (error) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-result-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="relative">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </button>
            <CardTitle id="sync-result-title" className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Erro na Sincronização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive/80">{error}</p>
          </CardContent>
          <CardFooter className="justify-end">
            <Button onClick={onClose}>Entendi</Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  // No result yet
  if (!result) return null

  const hasNewVideos = result.newVideos > 0
  const hasReopenedVideos = result.reopenedVideos > 0

  // Determine icon and title based on result
  const hasAnyChanges = hasNewVideos || hasReopenedVideos
  const Icon = hasAnyChanges ? CheckCircle2 : Info
  const iconColor = hasAnyChanges ? 'text-green-500' : 'text-muted-foreground'
  const title = hasAnyChanges ? 'Sincronização Concluída' : 'Nenhum Vídeo Novo'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-result-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Fechar</span>
          </button>
          <CardTitle id="sync-result-title" className={`flex items-center gap-2 ${iconColor}`}>
            <Icon className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* New videos */}
          {hasNewVideos && (
            <p className="text-sm">
              <span className="font-medium">{result.newVideos}</span>{' '}
              {result.newVideos === 1 ? 'novo vídeo encontrado' : 'novos vídeos encontrados'}
            </p>
          )}

          {/* Reopened videos */}
          {hasReopenedVideos && (
            <p className="text-sm">
              <span className="font-medium">{result.reopenedVideos}</span>{' '}
              {result.reopenedVideos === 1 ? 'vídeo voltou' : 'vídeos voltaram'} para edição
            </p>
          )}

          {/* No changes */}
          {!hasAnyChanges && (
            <p className="text-sm text-muted-foreground">
              Nenhum vídeo novo foi encontrado no canal.
            </p>
          )}
        </CardContent>

        <CardFooter className="justify-end">
          <Button onClick={onClose}>Entendi</Button>
        </CardFooter>
      </Card>
    </div>
  )
}
