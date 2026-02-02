'use client'

import { useCallback } from 'react'

import { cn } from '@/lib/utils'
import { getBestThumbnailUrl } from '@/lib/video-utils'
import type { ExtendedWizardPhase, WizardPhase } from '@/lib/wizard'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'

import { ConsoleArea } from './console-area'
import { VideoHeader, VideoMetadata, VideoShortTitle } from './video-header'
import { VideoPreview } from './video-preview'
import { WizardBreadcrumb } from './wizard-breadcrumb'
import { YouTubeProvider } from './youtube-context'

/**
 * Check if a phase is a standard wizard phase (1-8).
 */
function isStandardPhase(phase: ExtendedWizardPhase): phase is WizardPhase {
  return typeof phase === 'number' && phase >= 1 && phase <= 8
}

interface WizardLayoutProps {
  wizard: UseWizardReturn
  /** Video being processed - used for header display */
  video: Video
  /** Content for the interactive panel (right side of top half) */
  interactivePanel: React.ReactNode
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
  className,
}: WizardLayoutProps) {
  // Wrapper to handle ExtendedWizardPhase in navigation
  // Standard phases (1-8) use wizard.goToPhase
  // Extended phases (0, '5B') are handled by phase-specific components
  const handlePhaseClick = useCallback(
    (phase: ExtendedWizardPhase) => {
      if (isStandardPhase(phase)) {
        wizard.goToPhase(phase)
      }
      // Phase 0 and '5B' navigation is handled by their respective components
      // (phase-0-parent-selection.tsx and future phase-5b-short-title.tsx)
    },
    [wizard]
  )

  // Wrapper to check if extended phase can be navigated to
  // For standard phases, delegates to wizard.canNavigateToPhase
  // For phase 0: only navigable if it's the current phase (can't go back)
  // For phase '5B': same pattern - handled by phase component
  const canNavigateToExtendedPhase = useCallback(
    (phase: ExtendedWizardPhase): boolean => {
      if (isStandardPhase(phase)) {
        return wizard.canNavigateToPhase(phase)
      }
      // Extended phases (0, '5B') are only clickable when current
      // This prevents going back to phase 0 after advancing
      // Cast needed because wizard.state.currentPhase is typed as WizardPhase,
      // but can be 0 at runtime for cut/reel videos
      return (wizard.state.currentPhase as ExtendedWizardPhase) === phase
    },
    [wizard]
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
            onPhaseClick={handlePhaseClick}
            canNavigateToPhase={canNavigateToExtendedPhase}
          />
        </div>

        {/* Top half: Video + Interactive Panel */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Video Preview (left) */}
          <div className="lg:w-1/2 p-4 flex flex-col">
            <VideoHeader video={video} className="mb-3" />
            <VideoPreview
              videoId={wizard.state.videoId}
              thumbnailUrl={getBestThumbnailUrl(video.thumbnails)}
              className="max-w-2xl w-full flex-1"
            />
            {/* Short title display for cut videos - Story 4.3 AC2 */}
            <VideoShortTitle video={video} className="mt-2" />
            <VideoMetadata video={video} className="mt-3" />
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
