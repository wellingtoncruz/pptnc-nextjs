'use client'

import { FileVideo } from 'lucide-react'

import { WizardOrchestrator } from '@/components/wizard'
import type { VideoDetail, VideoSummary, Video } from '@/types/video'

interface VideoDetailPanelProps {
  videoId?: string | null
  /** Video data for display (from selected video) */
  video?: VideoDetail | VideoSummary | null
  /**
   * Optional podcast features. Propagated to the wizard so phases gated by
   * feature flags (Epic 22: Thumbnail) appear at the right moment in the flow.
   */
  features?: { thumbnailGeneration?: boolean; extraImagesGeneration?: boolean }
  /** Callback to refresh the video list when status changes (e.g., draft→ready, ready→sent) */
  onVideoStatusChange?: () => void
}

/**
 * Video detail panel.
 *
 * When a video is selected, shows the WizardLayout directly with:
 * - Breadcrumb for phase navigation
 * - Video preview (left) + Interactive panel (right)
 * - Console area (bottom)
 *
 * The wizard opens automatically at Phase 1 when a video is selected.
 * This follows the processamento_video.md specification.
 */
export function VideoDetailPanel({
  videoId,
  video,
  features,
  onVideoStatusChange,
}: VideoDetailPanelProps) {
  if (!videoId) {
    return <VideoDetailEmptyState />
  }

  // If no video data yet, show loading state
  if (!video) {
    return (
      <div
        data-testid="video-detail-panel"
        className="flex h-full flex-col items-center justify-center bg-background text-center"
      >
        <p className="text-sm text-muted-foreground">Carregando vídeo...</p>
      </div>
    )
  }

  // Show wizard directly when video is selected
  // Phase 1 opens automatically per processamento_video.md:
  // "A primeira fase do Wizard é a fase que já vem aberta no Wizard"
  return (
    <div data-testid="video-detail-panel" className="flex h-full flex-col bg-background">
      <WizardOrchestrator
        key={video.id}
        video={video as Video}
        features={features}
        className="flex flex-col h-full"
        onVideoStatusChange={onVideoStatusChange}
      />
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
