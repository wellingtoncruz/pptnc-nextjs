/**
 * Wizard state machine for managing the 8-phase video processing flow.
 *
 * The state machine handles:
 * - Phase transitions
 * - Phase status updates
 * - Data persistence per phase
 * - Cascade invalidation when reprocessing
 */

import { WIZARD_PHASES } from './constants'
import type {
  PhaseState,
  PhaseStatus,
  WizardAction,
  WizardPhase,
  WizardState,
} from './types'

/**
 * Creates the initial state for a phase.
 */
function createInitialPhaseState(): PhaseState {
  return {
    status: 'pending',
    data: null,
    error: null,
  }
}

/**
 * Creates the initial wizard state.
 */
export function createInitialWizardState(videoId: string): WizardState {
  const phases = {} as Record<WizardPhase, PhaseState>

  for (const phase of WIZARD_PHASES) {
    phases[phase] = createInitialPhaseState()
  }

  return {
    videoId,
    currentPhase: 1,
    phases,
  }
}

/**
 * Wizard state reducer.
 *
 * Handles all state transitions for the wizard.
 */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_PHASE': {
      // Can only navigate to phases that are completed or the next pending phase
      const targetPhase = action.phase
      const targetStatus = state.phases[targetPhase].status

      // Allow navigation to completed phases or the first pending phase
      if (targetStatus === 'completed' || targetStatus === 'pending') {
        return {
          ...state,
          currentPhase: targetPhase,
        }
      }
      return state
    }

    case 'SET_PHASE_STATUS': {
      return {
        ...state,
        phases: {
          ...state.phases,
          [action.phase]: {
            ...state.phases[action.phase],
            status: action.status,
            // Clear error when status changes to non-error
            error: action.status === 'error' ? state.phases[action.phase].error : null,
          },
        },
      }
    }

    case 'SET_PHASE_DATA': {
      return {
        ...state,
        phases: {
          ...state.phases,
          [action.phase]: {
            ...state.phases[action.phase],
            data: action.data,
            status: 'completed',
            error: null,
          },
        },
      }
    }

    case 'SET_PHASE_ERROR': {
      return {
        ...state,
        phases: {
          ...state.phases,
          [action.phase]: {
            ...state.phases[action.phase],
            status: 'error',
            error: action.error,
          },
        },
      }
    }

    case 'INVALIDATE_FROM_PHASE': {
      // Invalidate all phases AFTER the given phase
      const newPhases = { ...state.phases }

      for (const phase of WIZARD_PHASES) {
        if (phase > action.phase) {
          newPhases[phase] = createInitialPhaseState()
        }
      }

      return {
        ...state,
        phases: newPhases,
      }
    }

    case 'RESET': {
      return createInitialWizardState(state.videoId)
    }

    default:
      return state
  }
}

/**
 * Gets the next phase after the current one.
 * Returns null if already at the last phase.
 */
export function getNextPhase(currentPhase: WizardPhase): WizardPhase | null {
  if (currentPhase >= 8) return null
  return (currentPhase + 1) as WizardPhase
}

/**
 * Gets the previous phase before the current one.
 * Returns null if already at the first phase.
 */
export function getPreviousPhase(currentPhase: WizardPhase): WizardPhase | null {
  if (currentPhase <= 1) return null
  return (currentPhase - 1) as WizardPhase
}

/**
 * Checks if a phase can be navigated to.
 * A phase can be navigated to if:
 * - It's completed (can review)
 * - It's the first pending phase after completed phases (can work on)
 */
export function canNavigateToPhase(state: WizardState, targetPhase: WizardPhase): boolean {
  const targetStatus = state.phases[targetPhase].status

  // Can always navigate to completed phases
  if (targetStatus === 'completed') return true

  // Can navigate to pending phase if all previous phases are completed
  if (targetStatus === 'pending') {
    for (let phase = 1; phase < targetPhase; phase++) {
      if (state.phases[phase as WizardPhase].status !== 'completed') {
        return false
      }
    }
    return true
  }

  // Can navigate to error phase to retry
  if (targetStatus === 'error') return true

  // Cannot navigate to loading phase
  return false
}

/**
 * Gets the first incomplete phase (first non-completed phase).
 */
export function getFirstIncompletePhase(state: WizardState): WizardPhase {
  for (const phase of WIZARD_PHASES) {
    if (state.phases[phase].status !== 'completed') {
      return phase
    }
  }
  return 8 // All completed, return last phase
}

/**
 * Checks if all phases are completed.
 */
export function isWizardComplete(state: WizardState): boolean {
  return WIZARD_PHASES.every((phase) => state.phases[phase].status === 'completed')
}

/**
 * Gets the overall progress percentage (0-100).
 */
export function getWizardProgress(state: WizardState): number {
  const completedCount = WIZARD_PHASES.filter(
    (phase) => state.phases[phase].status === 'completed'
  ).length
  return Math.round((completedCount / WIZARD_PHASES.length) * 100)
}
