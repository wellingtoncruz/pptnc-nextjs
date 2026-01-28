'use client'

import { AlertCircle, Check, Circle, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { PHASE_METADATA, WIZARD_PHASES, WizardPhase, WizardState } from '@/lib/wizard'

interface WizardBreadcrumbProps {
  state: WizardState
  onPhaseClick: (phase: WizardPhase) => void
  canNavigateToPhase: (phase: WizardPhase) => boolean
}

/**
 * Breadcrumb component showing the 8 phases of the wizard.
 *
 * Indicators:
 * - ✓ Green: completed
 * - ● Blue pulsing: loading
 * - ○ Gray: pending
 * - ⚠ Yellow: error
 */
export function WizardBreadcrumb({
  state,
  onPhaseClick,
  canNavigateToPhase,
}: WizardBreadcrumbProps) {
  return (
    <nav aria-label="Wizard progress" className="w-full">
      <ol className="flex items-center justify-between gap-1">
        {WIZARD_PHASES.map((phase, index) => {
          const phaseState = state.phases[phase]
          const metadata = PHASE_METADATA[phase]
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
                    !isCurrent && phaseState.status === 'error' && 'text-yellow-400',
                    !isCurrent && phaseState.status === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {metadata.label}
                </span>
              </button>

              {/* Connector line */}
              {index < WIZARD_PHASES.length - 1 && (
                <div
                  className={cn(
                    'h-px flex-1 mx-1 min-w-2',
                    phaseState.status === 'completed' ? 'bg-green-400/50' : 'bg-border'
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
      return <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0" />
    case 'pending':
    default:
      return <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
  }
}
