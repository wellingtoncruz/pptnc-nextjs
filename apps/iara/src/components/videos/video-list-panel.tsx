'use client'

import { RefreshCw, Inbox } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

interface VideoListPanelProps {
  onSync?: () => void
  isSyncing?: boolean
}

/**
 * Video list panel with header and scrollable list area.
 * Placeholder for video items - will be implemented in Story 3.5.
 */
export function VideoListPanel({ onSync, isSyncing = false }: VideoListPanelProps) {
  return (
    <div data-testid="video-list-panel" className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <h2 className="text-lg font-semibold">Vídeos</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={isSyncing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Verificando...' : 'Verificar novos'}
        </Button>
      </div>

      {/* Video List */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Empty state - placeholder for video items */}
          <VideoListEmptyState />
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * Empty state shown when no videos are available.
 */
function VideoListEmptyState() {
  return (
    <div
      data-testid="video-list-empty"
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <Inbox className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">Nenhum vídeo encontrado</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Clique em &quot;Verificar novos&quot; para buscar vídeos do seu canal.
      </p>
    </div>
  )
}
