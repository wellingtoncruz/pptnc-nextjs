'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface ReopenVideoDialogProps {
  videoId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (videoId: string) => void
}

/**
 * AlertDialog for reopening a sent video for editing.
 *
 * Reopening is editorial-only (ADR-25.4) — no YouTube status check. Any sent
 * video can be reopened to draft at the producer's discretion.
 *
 * @see Story 11-2 - Reabrir Episódio para Edição
 * @see Story 25.11 - Reabertura desacoplada do YouTube
 */
export function ReopenVideoDialog({
  videoId,
  open,
  onOpenChange,
  onSuccess,
}: ReopenVideoDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setError(null)
      setIsLoading(false)
    }
  }, [open])

  const handleConfirm = async () => {
    if (!videoId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/videos/${videoId}/reopen`, {
        method: 'POST',
      })

      const json = await response.json()

      if (!response.ok) {
        setError(json.error?.message || 'Erro ao reabrir o vídeo. Tente novamente.')
        return
      }

      // Success - close dialog and notify parent
      onOpenChange(false)
      onSuccess(videoId)
    } catch {
      setError('Erro ao reabrir o vídeo. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setError(null)
      setIsLoading(false)
    }
    onOpenChange(newOpen)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deseja reabrir esse vídeo para edição dos metadados?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                O vídeo voltará para o status <strong>Rascunho</strong> e poderá ser editado
                novamente. Isso não altera o vídeo no YouTube.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reabrindo...
              </>
            ) : (
              'Reabrir'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
