'use client'

import { useCallback } from 'react'

import { cn } from '@/lib/utils'
import { getBestThumbnailUrl } from '@/lib/video-utils'
import {
  getPhaseIdsForVideoTypeWithFeatures,
  isTrackedPhaseId,
  type WizardPhaseId,
} from '@/lib/wizard'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'

import { ConsoleArea } from './console-area'
import { StandaloneToggle } from './standalone-toggle'
import { VideoHeader, VideoMetadata, VideoShortTitle } from './video-header'
import { VideoPreview } from './video-preview'
import { ExtraImagesDownloads } from './extra-images-downloads'
import { WizardBreadcrumb, getExtendedPhaseState } from './wizard-breadcrumb'
import { YouTubeProvider } from './youtube-context'

interface WizardLayoutProps {
  wizard: UseWizardReturn
  /** Video being processed - used for header display */
  video: Video
  /** Content for the interactive panel (right side of top half) */
  interactivePanel: React.ReactNode
  /** Callback when title is changed. If provided, title becomes editable. */
  onTitleChange?: (newTitle: string) => Promise<void>
  /** Callback when short title is changed. If provided, short title becomes editable. */
  onShortTitleChange?: (newShortTitle: string) => Promise<void>
  /**
   * Callback to toggle the editorial `standalone` flag (Epic 25). When provided,
   * a "Vídeo avulso" toggle is shown in the video header for cut/reel videos.
   */
  onStandaloneToggle?: (next: boolean) => Promise<void>
  /**
   * Optional podcast features used to gate phases conditionally in the
   * breadcrumb. Currently only `thumbnailGeneration` (Epic 22 / Story 22.3a)
   * is consumed — inserts the Thumbnail phase between Tags and Publicar for
   * episode and cut video types.
   */
  features?: { thumbnailGeneration?: boolean; extraImagesGeneration?: boolean }
  className?: string
}

/**
 * Main layout component for the wizard.
 *
 * Layout structure:
 * ```
 * ┌─────────────────────────────────────────┐
 * │ [Breadcrumb: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8] │
 * ├─────────────────────┬───────────────────┤
 * │                     │                   │
 * │   Video Preview     │  Interactive      │
 * │   (YouTube embed)   │  Panel            │
 * │                     │  (fase-specific)  │
 * │                     │                   │
 * ├─────────────────────┴───────────────────┤
 * │                                         │
 * │   Console Area                          │
 * │   (scrollable, stacks alerts)           │
 * │                                         │
 * └─────────────────────────────────────────┘
 * ```
 */
export function WizardLayout({
  wizard,
  video,
  interactivePanel,
  onTitleChange,
  onShortTitleChange,
  onStandaloneToggle,
  features,
  className,
}: WizardLayoutProps) {
  // Wrapper to handle phase navigation.
  // Tracked phases use wizard.goToPhase; extended phases (parent/short-title/
  // thumbnail) are handled by phase-specific components.
  // Unified navigation (Epic 26): every phase navigates via goToPhase. Extended
  // phases (parent/short-title/thumbnail/links) have no state slot — goToPhase
  // sets currentPhase directly; their interactive panels render on currentPhase.
  const handlePhaseClick = useCallback(
    (phase: WizardPhaseId) => {
      wizard.goToPhase(phase)
    },
    [wizard]
  )

  // Wrapper to check if a phase can be navigated to. Unified rule (Epic 26):
  // - tracked phases delegate to wizard.canNavigateToPhase (allows completed).
  // - extended phases are clickable when current OR already completed — so the
  //   producer can revisit them (e.g. change the thumbnail, add another link,
  //   re-pick the parent). Completion is derived from video data via
  //   getExtendedPhaseState (parentEpisodeId / shortTitle / storageThumbnailUrl
  //   / reviewedPhases.includes('links')).
  //
  // Epic 28 abre UMA exceção, restrita a `extra-images`: a fase também é
  // clicável quando todas as fases anteriores estão concluídas, mesmo que ela
  // própria nunca tenha sido visitada.
  //
  // Motivo: a regra "atual ou concluída" torna qualquer fase NOVA inalcançável
  // pelo breadcrumb em vídeos processados ANTES dela existir — eles nunca a
  // visitaram, logo nunca a concluíram, logo o clique fica travado para sempre.
  // Isso apareceu na homologação: os episódios existentes não conseguiam chegar
  // às Imagens Extras. `thumbnail` e `links` têm a mesma limitação, e foi
  // decisão do Wellington (2026-07-28) NÃO mexer nelas agora — o comportamento
  // delas já está homologado e a mudança fica para uma revisão própria.
  const canNavigateToExtendedPhase = useCallback(
    (phase: WizardPhaseId): boolean => {
      if (isTrackedPhaseId(phase)) {
        return wizard.canNavigateToPhase(phase)
      }
      if (wizard.state.currentPhase === phase) return true
      if (getExtendedPhaseState(phase, video).status === 'completed') return true

      if (phase === 'extra-images') {
        const sequence = getPhaseIdsForVideoTypeWithFeatures(
          video.videoType ?? 'episode',
          features,
          video.standalone === true
        )
        const targetIndex = sequence.indexOf(phase)
        if (targetIndex < 0) return false
        return sequence
          .slice(0, targetIndex)
          .every((previous) =>
            isTrackedPhaseId(previous)
              ? wizard.state.phases[previous].status === 'completed' ||
                wizard.state.phases[previous].status === 'needs_review'
              : getExtendedPhaseState(previous, video).status === 'completed'
          )
      }

      return false
    },
    [wizard, video, features]
  )

  return (
    <YouTubeProvider>
      <div className={cn('flex flex-col h-full', className)}>
        {/* Breadcrumb */}
        <div className="shrink-0 border-b px-4 py-3">
          <WizardBreadcrumb
            state={wizard.state}
            videoType={video.videoType ?? 'episode'}
            video={video}
            features={features}
            onPhaseClick={handlePhaseClick}
            canNavigateToPhase={canNavigateToExtendedPhase}
          />
        </div>

        {/* Top half: Video + Interactive Panel */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Video Preview (left)
              `min-h-0 overflow-auto` espelha o que a coluna direita já fazia. Sem
              isso a coluna transborda quando o conteúdo abaixo do player não cabe:
              o embed tem proporção fixa e não cede o espaço que o `flex-1` promete,
              então o excedente vazava por cima do painel (Epic 28, homologação). */}
          <div className="lg:w-1/2 p-4 flex flex-col min-h-0 overflow-auto">
            <VideoHeader video={video} onTitleChange={onTitleChange} className="mb-2" />
            {onStandaloneToggle && (
              <StandaloneToggle video={video} onToggle={onStandaloneToggle} className="mb-3" />
            )}
            <VideoPreview
              videoId={wizard.state.videoId}
              thumbnailUrl={video.storageThumbnailUrl || getBestThumbnailUrl(video.thumbnails)}
              className="max-w-2xl w-full flex-1 shrink-0"
            />
            {/* Short title display for cut videos - Story 4.3 AC2 */}
            <VideoShortTitle video={video} onShortTitleChange={onShortTitleChange} className="mt-2" />
            <VideoMetadata video={video} className="mt-3" />
            {/* Epic 28 — download das imagens extras, acessível de qualquer fase.
                Some quando o episódio não tem nenhuma persistida. */}
            <ExtraImagesDownloads extraImages={video.extraImages} className="mt-3" />
          </div>

          {/* Interactive Panel (right) */}
          <div className="lg:w-1/2 p-4 border-t lg:border-t-0 lg:border-l overflow-auto">
            {interactivePanel}
          </div>
        </div>

        {/* Bottom half: Console Area */}
        <div className="h-72 lg:h-[336px] shrink-0 border-t bg-muted/30">
          <ConsoleArea messages={wizard.consoleMessages} />
        </div>
      </div>
    </YouTubeProvider>
  )
}
