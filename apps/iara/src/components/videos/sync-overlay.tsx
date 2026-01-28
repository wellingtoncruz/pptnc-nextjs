'use client'

import { Loader2 } from 'lucide-react'

interface SyncOverlayProps {
  isOpen: boolean
  message?: string
}

/**
 * Full-screen overlay shown during video sync operations.
 * Blocks all user interaction while sync is in progress.
 */
export function SyncOverlay({ isOpen, message = 'Verificando novos vídeos...' }: SyncOverlayProps) {
  if (!isOpen) return null

  return (
    <div
      data-testid="sync-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sincronização em andamento"
    >
      <div className="flex flex-col items-center gap-4 rounded-lg bg-card p-8 shadow-lg border border-border">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
