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
 * Verifies the video's YouTube privacy status before reopening.
 * Shows inline error if the video is public or scheduled.
 *
 * @see Story 11-2 - Reabrir Episódio para Edição
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
        if (json.error?.code === 'VIDEO_NOT_ELIGIBLE') {
          setError(
            'O vídeo não está com o status adequado no YouTube. Não é possível reabrir. Altere o vídeo para Não Listado.'
          )
        } else {
          setError(
            json.error?.message || 'Erro ao verificar status do vídeo no YouTube. Tente novamente.'
          )
        }
        return
      }

      // Success - close dialog and notify parent
      onOpenChange(false)
      onSuccess(videoId)
    } catch {
      setError('Erro ao verificar status do vídeo no YouTube. Tente novamente.')
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
                Para o vídeo ser reaberto, é necessário que ele esteja como{' '}
                <strong>Privado</strong>, <strong>Rascunho</strong> ou{' '}
                <strong>Não listado</strong> no YouTube.
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
                Verificando...
              </>
            ) : (
              'Verificar e Reabrir'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
