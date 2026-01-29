'use client'

import { cn } from '@/lib/utils'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'

import { ConsoleArea } from './console-area'
import { VideoHeader, VideoMetadata } from './video-header'
import { VideoPreview } from './video-preview'
import { WizardBreadcrumb } from './wizard-breadcrumb'
import { YouTubeProvider } from './youtube-context'

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
  return (
    <YouTubeProvider>
      <div className={cn('flex flex-col h-full', className)}>
        {/* Breadcrumb */}
        <div className="shrink-0 border-b px-4 py-3">
          <WizardBreadcrumb
            state={wizard.state}
            onPhaseClick={wizard.goToPhase}
            canNavigateToPhase={wizard.canNavigateToPhase}
          />
        </div>

        {/* Top half: Video + Interactive Panel */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Video Preview (left) */}
          <div className="lg:w-1/2 p-4 flex flex-col">
            <VideoHeader video={video} className="mb-3" />
            <VideoPreview
              videoId={wizard.state.videoId}
              className="max-w-2xl w-full flex-1"
            />
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
