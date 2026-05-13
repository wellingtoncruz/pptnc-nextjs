'use client'

import { AlertCircle, Check, Circle, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  EXTENDED_PHASE_METADATA,
  ExtendedWizardPhase,
  getPhasesForVideoTypeWithFeatures,
  VideoTypeForWizard,
  WizardState,
} from '@/lib/wizard'
import type { Video } from '@/types/video'

interface WizardBreadcrumbProps {
  state: WizardState
  videoType?: VideoTypeForWizard
  /** Video data used to determine completion of extended phases (0, 5B) */
  video?: Video
  /**
   * Optional podcast features. When `thumbnailGeneration` is enabled and the
   * video type is episode or cut, the breadcrumb adds the Thumbnail phase
   * between Tags (7) and Publicar (8). Epic 22 / Story 22.3a.
   * When omitted, behavior is identical to before Epic 22 (no Thumbnail).
   */
  features?: { thumbnailGeneration?: boolean }
  onPhaseClick: (phase: ExtendedWizardPhase) => void
  canNavigateToPhase: (phase: ExtendedWizardPhase) => boolean
}

/**
 * Default phase state for phases not in the wizard state (e.g., phase 0 and 5B for cut/reel).
 */
const DEFAULT_PHASE_STATE = { status: 'pending' as const, data: null, error: null }

/**
 * Determines the phase state for extended phases (0 and 5B) based on video data.
 *
 * - Phase 0: completed if video.parentEpisodeId is defined
 * - Phase 5B: completed if video.shortTitle is defined
 */
function getExtendedPhaseState(
  phase: ExtendedWizardPhase,
  video?: Video
): { status: 'pending' | 'completed'; data: null; error: null } {
  if (!video) {
    return DEFAULT_PHASE_STATE
  }

  if (phase === 0) {
    // Phase 0 is complete when parentEpisodeId is set
    return video.parentEpisodeId
      ? { status: 'completed', data: null, error: null }
      : DEFAULT_PHASE_STATE
  }

  if (phase === '5B') {
    // Phase 5B is complete when shortTitle is set
    return video.shortTitle
      ? { status: 'completed', data: null, error: null }
      : DEFAULT_PHASE_STATE
  }

  return DEFAULT_PHASE_STATE
}

/**
 * Breadcrumb component showing the phases of the wizard.
 *
 * For episodes: shows phases 1-8
 * For cut/reel: shows the appropriate phases (0, 5, 5B, 6, 7, 8 for cut; 0, 5, 6, 7, 8 for reel)
 *
 * Indicators:
 * - ✓ Green: completed
 * - ● Blue pulsing: loading
 * - ○ Gray: pending
 * - ⚠ Yellow: needs review (phases 2, 3 have data but not confirmed)
 * - ⚠ Red: error
 */
export function WizardBreadcrumb({
  state,
  videoType = 'episode',
  video,
  features,
  onPhaseClick,
  canNavigateToPhase,
}: WizardBreadcrumbProps) {
  const phases = getPhasesForVideoTypeWithFeatures(videoType, features)

  return (
    <nav aria-label="Wizard progress" className="w-full">
      <ol className="flex items-center justify-between gap-1">
        {phases.map((phase, index) => {
          // Get phase state - use video data for extended phases (0, '5B')
          const phaseState =
            typeof phase === 'number' && phase >= 1 && phase <= 8
              ? state.phases[phase as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8]
              : getExtendedPhaseState(phase, video)
          const metadata = EXTENDED_PHASE_METADATA[phase]
          const isCurrent = state.currentPhase === phase
          const canNavigate = canNavigateToPhase(phase)

          return (
            <li key={phase} className="flex items-center flex-1">
              {/* Phase indicator */}
              <button
                type="button"
                onClick={() => canNavigate && onPhaseClick(phase)}
                disabled={!canNavigate}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all w-full',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isCurrent && 'bg-accent',
                  canNavigate && !isCurrent && 'hover:bg-accent/50 cursor-pointer',
                  !canNavigate && 'cursor-not-allowed opacity-50'
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {/* Status icon */}
                <PhaseIcon status={phaseState.status} />

                {/* Phase label */}
                <span
                  className={cn(
                    'text-xs font-medium truncate',
                    isCurrent && 'text-foreground',
                    !isCurrent && phaseState.status === 'completed' && 'text-green-400',
                    !isCurrent && phaseState.status === 'error' && 'text-red-400',
                    !isCurrent && phaseState.status === 'needs_review' && 'text-yellow-400',
                    !isCurrent && phaseState.status === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {metadata.label}
                </span>
              </button>

              {/* Connector line */}
              {index < phases.length - 1 && (
                <div
                  className={cn(
                    'h-px flex-1 mx-1 min-w-2',
                    phaseState.status === 'completed' && 'bg-green-400/50',
                    phaseState.status === 'needs_review' && 'bg-yellow-400/50',
                    phaseState.status !== 'completed' && phaseState.status !== 'needs_review' && 'bg-border'
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * Phase status icon component.
 */
function PhaseIcon({ status }: { status: WizardState['phases'][1]['status'] }) {
  switch (status) {
    case 'completed':
      return <Check className="h-4 w-4 text-green-400 shrink-0" />
    case 'loading':
      return <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
    case 'needs_review':
      return <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0" />
    case 'pending':
    default:
      return <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
  }
}
