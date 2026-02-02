'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { log } from '@/lib/logger'
import type { Video } from '@/types/video'

/**
 * Error codes returned by the transcription API.
 */
type TranscriptionErrorCode =
  | 'TRANSCRIPTION_UNAVAILABLE'
  | 'QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

/**
 * Error messages in Portuguese.
 */
const ERROR_MESSAGES: Record<TranscriptionErrorCode, string> = {
  TRANSCRIPTION_UNAVAILABLE:
    'Esse vídeo ainda está em processamento pelo YouTube, tente novamente em alguns minutos',
  QUOTA_EXCEEDED: 'Limite de requisições atingido, tente novamente mais tarde',
  NETWORK_ERROR: 'Erro de conexão, verifique sua internet e tente novamente',
  UNKNOWN_ERROR: 'Ocorreu um erro inesperado, tente novamente',
}

/**
 * Determines if the error is retryable.
 */
function isRetryableError(code: TranscriptionErrorCode): boolean {
  // TRANSCRIPTION_UNAVAILABLE and QUOTA_EXCEEDED are not immediately retryable
  // They require time to pass (video processing or quota reset)
  return code === 'NETWORK_ERROR' || code === 'UNKNOWN_ERROR'
}

/**
 * Transcription data returned on successful load.
 */
export interface TranscriptionData {
  transcriptionSRT: string
  transcriptionTXT: string
}

interface TranscriptionLoaderProps {
  /** Video that needs transcription */
  video: Video
  /** Called after transcription is successfully saved, with the transcription data */
  onSuccess: (data: TranscriptionData) => void
  /** Called when user cancels (clicks "Voltar") */
  onCancel: () => void
}

/**
 * Component for loading transcription on-demand.
 *
 * Displays a spinner while fetching the transcription from YouTube.
 * Shows error messages with appropriate actions when fetch fails.
 *
 * @see Story 5.6 - Transcrição On-Demand
 */
export function TranscriptionLoader({
  video,
  onSuccess,
  onCancel,
}: TranscriptionLoaderProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<TranscriptionErrorCode | null>(null)

  /**
   * Fetch transcription from the API.
   */
  const fetchTranscription = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/videos/${video.id}/transcription`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        // Map API error codes to component error codes
        const apiErrorCode = data.error?.code as string | undefined

        if (apiErrorCode === 'TRANSCRIPTION_UNAVAILABLE') {
          setError('TRANSCRIPTION_UNAVAILABLE')
        } else if (apiErrorCode === 'QUOTA_EXCEEDED') {
          setError('QUOTA_EXCEEDED')
        } else if (
          apiErrorCode === 'AUTH_EXPIRED' ||
          apiErrorCode === 'NO_TOKENS' ||
          apiErrorCode === 'TOKEN_REFRESH_FAILED'
        ) {
          // Auth errors - redirect to login
          router.push('/api/auth/signin')
          return
        } else {
          setError('UNKNOWN_ERROR')
        }

        log('WARN', 'Transcription fetch failed', {
          videoId: video.id,
          status: response.status,
          error: data.error,
        })
        return
      }

      // Success - pass transcription data to onSuccess
      const transcriptionData: TranscriptionData = {
        transcriptionSRT: data.data.transcriptionSRT,
        transcriptionTXT: data.data.transcriptionTXT,
      }
      log('INFO', 'Transcription loaded successfully', { videoId: video.id })
      onSuccess(transcriptionData)
    } catch (err) {
      // Network error
      log('ERROR', 'Transcription fetch network error', {
        videoId: video.id,
        error: err instanceof Error ? err.message : String(err),
      })
      setError('NETWORK_ERROR')
    } finally {
      setIsLoading(false)
    }
  }, [video.id, onSuccess, router])

  // Fetch transcription on mount
  useEffect(() => {
    fetchTranscription()
  }, [fetchTranscription])

  /**
   * Handle "Voltar" button click.
   */
  const handleBack = useCallback(() => {
    onCancel()
    router.push('/videos')
  }, [onCancel, router])

  /**
   * Handle "Tentar novamente" button click.
   */
  const handleRetry = useCallback(() => {
    fetchTranscription()
  }, [fetchTranscription])

  // Loading state
  if (isLoading) {
    return (
      <div
        data-testid="transcription-loader"
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Carregando transcrição"
      >
        <div className="flex flex-col items-center gap-4 rounded-lg bg-card p-8 shadow-lg border border-border">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Estamos transcrevendo o seu vídeo...
          </p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    const errorMessage = ERROR_MESSAGES[error]
    const canRetry = isRetryableError(error)

    return (
      <div
        data-testid="transcription-loader-error"
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Erro ao carregar transcrição"
      >
        <div className="flex flex-col items-center gap-4 rounded-lg bg-card p-8 shadow-lg border border-border max-w-md">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-center text-foreground">{errorMessage}</p>
          <div className="flex gap-3">
            {canRetry && (
              <Button variant="outline" onClick={handleRetry}>
                Tentar novamente
              </Button>
            )}
            <Button onClick={handleBack}>Voltar</Button>
          </div>
        </div>
      </div>
    )
  }

  // Success state - should not render (onSuccess navigates away)
  return null
}
