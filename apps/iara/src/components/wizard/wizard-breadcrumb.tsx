'use client'

import { AlertCircle, Check, Circle, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  PHASE_ID_METADATA,
  getPhaseIdsForVideoTypeWithFeatures,
  isTrackedPhaseId,
  type TrackedPhaseId,
  VideoTypeForWizard,
  type WizardPhaseId,
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
  features?: { thumbnailGeneration?: boolean; extraImagesGeneration?: boolean }
  onPhaseClick: (phase: WizardPhaseId) => void
  canNavigateToPhase: (phase: WizardPhaseId) => boolean
}

/**
 * Default phase state for phases not in the wizard state (e.g., phase 0 and 5B for cut/reel).
 */
const DEFAULT_PHASE_STATE = { status: 'pending' as const, data: null, error: null }

/**
 * Determines the phase state for extended phases (parent, short-title,
 * thumbnail, links) based on video data.
 *
 * - Phase 0: completed if video.parentEpisodeId is defined
 * - Phase 5B: completed if video.shortTitle is defined
 * - Phase THUMB: completed if video.storageThumbnailUrl is defined (Epic 22 / Story 22.3g
 *   persiste a URL final aqui ao clicar Continuar). Aceita tanto Cloud Storage
 *   URLs novas quanto base64 legacy (TD-5) — qualquer thumbnail conta como
 *   "produtor decidiu" para fins de progresso visual no breadcrumb.
 * - Phase links: completed if video.reviewedPhases includes 'links' (Epic 26 —
 *   confirmação de revisão; zero links é estado válido).
 */
export function getExtendedPhaseState(
  phase: WizardPhaseId,
  video?: Video
): { status: 'pending' | 'completed'; data: null; error: null } {
  if (!video) {
    return DEFAULT_PHASE_STATE
  }

  if (phase === 'parent') {
    // Parent phase is complete when parentEpisodeId is set
    return video.parentEpisodeId
      ? { status: 'completed', data: null, error: null }
      : DEFAULT_PHASE_STATE
  }

  if (phase === 'short-title') {
    // Short-title phase is complete when shortTitle is set
    return video.shortTitle
      ? { status: 'completed', data: null, error: null }
      : DEFAULT_PHASE_STATE
  }

  if (phase === 'thumbnail') {
    // Phase THUMB é "completada" SÓ quando a thumbnail veio do fluxo do
    // wizard (Story 22.3g grava sempre como `/api/wizard/thumbnail/select?path=...`).
    // Vídeos importados do YouTube já vêm com `storageThumbnailUrl` populado
    // — seja em base64 legacy (TD-5) ou URL `i.ytimg.com` — mas isso é só a
    // thumbnail automática do YouTube, não decisão do produtor. Marcar como
    // completed nesse caso confunde o progresso visual.
    const url = video.storageThumbnailUrl
    const isFromWizard = typeof url === 'string' && url.startsWith('/api/wizard/thumbnail/select')
    return isFromWizard
      ? { status: 'completed', data: null, error: null }
      : DEFAULT_PHASE_STATE
  }

  if (phase === 'links') {
    // Phase Links (Epic 26) é "completada" quando o produtor confirma a revisão
    // (reviewedPhases inclui 'links'). Zero links é um estado válido de concluído
    // — por isso a completude vem da confirmação, não da presença de links.
    return video.reviewedPhases?.includes('links')
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
  // Standalone videos (Epic 25) drop the parent + podcast-only phases.
  const phases = getPhaseIdsForVideoTypeWithFeatures(videoType, features, video?.standalone)

  return (
    <nav aria-label="Wizard progress" className="w-full">
      <ol className="flex items-center justify-between gap-1">
        {phases.map((phase, index) => {
          // Get phase state - use video data for extended phases (parent/short-title/thumbnail)
          const phaseState = isTrackedPhaseId(phase)
            ? state.phases[phase]
            : getExtendedPhaseState(phase, video)
          const metadata = PHASE_ID_METADATA[phase]
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
function PhaseIcon({ status }: { status: WizardState['phases'][TrackedPhaseId]['status'] }) {
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
