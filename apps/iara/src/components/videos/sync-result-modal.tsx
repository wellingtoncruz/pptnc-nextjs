'use client'

import { useEffect, useCallback } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { RemovalResult } from '@/lib/sync/remove-deleted-videos'

/**
 * Sync result data for the modal.
 *
 * Note: Transcriptions are no longer fetched during sync (Story 5.6).
 * They are fetched on-demand when the producer selects a video.
 */
export interface SyncResultData {
  /** Number of new videos found */
  newVideos: number
  /** Vídeos que sumiram do YouTube — só com `features.syncRemovesDeletedVideos`. */
  removal?: RemovalResult
  /** Lives ainda no ar/agendadas — entram no sync depois que terminarem. */
  liveInProgressSkipped?: number
}

const SKIP_REASON: Record<'linked' | 'busy', string> = {
  linked: 'vinculado a outro vídeo',
  busy: 'em processamento ou com geração em andamento',
}

function RemovalSummary({ removal }: { removal: RemovalResult }) {
  return (
    <>
      {removal.removed.length > 0 && (
        <div className="text-sm">
          <p>
            <span className="font-medium">{removal.removed.length}</span>{' '}
            {removal.removed.length === 1
              ? 'vídeo removido (não existe mais no YouTube):'
              : 'vídeos removidos (não existem mais no YouTube):'}
          </p>
          <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5 text-muted-foreground">
            {removal.removed.map((v) => (
              <li key={v.id}>{v.title}</li>
            ))}
          </ul>
        </div>
      )}
      {removal.skipped.length > 0 && (
        <div className="text-sm text-amber-600 dark:text-amber-400">
          <p>Sumiram do YouTube, mas ficaram na IAra:</p>
          <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5">
            {removal.skipped.map((v) => (
              <li key={v.id}>
                {v.title} — {SKIP_REASON[v.reason]}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Vídeos vinculados saem no próximo sync depois que o vínculo for desfeito.</p>
        </div>
      )}
      {removal.missingFromPlaylist > 0 && (
        <p className="text-sm text-muted-foreground">
          {removal.missingFromPlaylist === 1
            ? '1 vídeo não veio na lista do YouTube, mas ainda existe — mantido.'
            : `${removal.missingFromPlaylist} vídeos não vieram na lista do YouTube, mas ainda existem — mantidos.`}
        </p>
      )}
      {removal.pendingWrongAccount > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {removal.pendingWrongAccount === 1
            ? '1 vídeo não existe mais no YouTube'
            : `${removal.pendingWrongAccount} vídeos não existem mais no YouTube`}
          , mas nada foi removido: a conta que sincronizou não é a do canal. Sincronize com a conta do canal para removê-los.
        </p>
      )}
    </>
  )
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
 * - General error message if sync failed
 *
 * Note: Transcriptions are no longer fetched during sync (Story 5.6).
 * Sent videos are never reopened by sync — only via explicit user action
 * (POST /api/videos/[videoId]/reopen).
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
  const hasRemoved = (result.removal?.removed.length ?? 0) > 0
  const hasChanges = hasNewVideos || hasRemoved

  const Icon = hasChanges ? CheckCircle2 : Info
  const iconColor = hasChanges ? 'text-green-500' : 'text-muted-foreground'
  const title = hasChanges ? 'Sincronização Concluída' : 'Nenhum Vídeo Novo'

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
          {hasNewVideos ? (
            <p className="text-sm">
              <span className="font-medium">{result.newVideos}</span>{' '}
              {result.newVideos === 1 ? 'novo vídeo encontrado' : 'novos vídeos encontrados'}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum vídeo novo foi encontrado no canal.
            </p>
          )}
          {(result.liveInProgressSkipped ?? 0) > 0 && (
            <p className="text-sm text-muted-foreground">
              {result.liveInProgressSkipped === 1
                ? '1 live ainda no ar ou agendada entra no próximo sync, depois que terminar.'
                : `${result.liveInProgressSkipped} lives ainda no ar ou agendadas entram no próximo sync, depois que terminarem.`}
            </p>
          )}
          {result.removal && <RemovalSummary removal={result.removal} />}
        </CardContent>

        <CardFooter className="justify-end">
          <Button onClick={onClose}>Entendi</Button>
        </CardFooter>
      </Card>
    </div>
  )
}
