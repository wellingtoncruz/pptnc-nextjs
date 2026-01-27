'use client'

import { FileVideo } from 'lucide-react'

import { ScrollArea } from '@/components/ui/scroll-area'

interface VideoDetailPanelProps {
  videoId?: string | null
}

/**
 * Video detail panel showing selected video information.
 * Shows empty state when no video is selected.
 */
export function VideoDetailPanel({ videoId }: VideoDetailPanelProps) {
  if (!videoId) {
    return <VideoDetailEmptyState />
  }

  // Placeholder for video details - will be implemented in Story 5.2
  return (
    <div data-testid="video-detail-panel" className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-14 items-center border-b border-border px-4">
        <h2 className="text-lg font-semibold">Detalhes do Vídeo</h2>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <p className="text-sm text-muted-foreground">
            Vídeo selecionado: {videoId}
          </p>
          {/* Video details will be implemented in Story 5.2 */}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * Empty state shown when no video is selected.
 */
function VideoDetailEmptyState() {
  return (
    <div
      data-testid="video-detail-panel"
      className="flex h-full flex-col items-center justify-center bg-background text-center"
    >
      <FileVideo className="h-16 w-16 text-muted-foreground/30" />
      <h3 className="mt-4 text-lg font-medium text-muted-foreground">
        Selecione um vídeo
      </h3>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground/70">
        Escolha um vídeo da lista para ver os detalhes e editar os metadados.
      </p>
    </div>
  )
}
