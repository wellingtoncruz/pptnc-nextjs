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
  VideoDataForSync,
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
 * Check if a phase has data in the video document.
 * Used to validate localStorage state against Firestore data.
 */
function phaseHasDataInVideo(video: VideoDataForSync, phase: WizardPhase): boolean {
  switch (phase) {
    case 1:
      return typeof video.critique === 'string' && video.critique.trim().length > 0
    case 2:
      // editingIssues: array existence means data exists (empty = no issues found)
      return video.editingIssues !== undefined
    case 3:
      // riskAndCompliance: array existence means data exists (empty = no risks found)
      return video.riskAndCompliance !== undefined
    case 4:
      // chapters: must have actual content
      return Array.isArray(video.chapters) && video.chapters.length > 0
    case 5:
      // suggestedTitles: LLM-generated suggestions (not user-selected title)
      return Array.isArray(video.suggestedTitles) && video.suggestedTitles.length > 0
    case 6:
      return typeof video.description === 'string' && video.description.trim().length > 0
    case 7:
      // tags: must have actual content
      return Array.isArray(video.tags) && video.tags.length > 0
    case 8:
      return video.status === 'sent'
    default:
      return false
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

    case 'COMPLETE_PHASE_AND_ADVANCE': {
      // Combined action: mark phase as completed AND navigate to next phase
      // This avoids the stale state issue when calling setPhaseData + goToNextPhase separately
      const nextPhase = action.phase < 8 ? ((action.phase + 1) as WizardPhase) : action.phase

      return {
        ...state,
        currentPhase: nextPhase,
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

    case 'RESET': {
      return createInitialWizardState(state.videoId)
    }

    case 'SYNC_WITH_VIDEO_DATA': {
      // Sync localStorage state with actual video data from Firestore.
      // If a phase is marked as 'completed' in localStorage but the
      // corresponding data doesn't exist in Firestore, reset it to 'pending'.
      const { videoData } = action
      let hasChanges = false
      const newPhases = { ...state.phases }

      for (const phase of WIZARD_PHASES) {
        const phaseState = state.phases[phase]

        // Only check phases that are marked as completed
        if (phaseState.status !== 'completed') continue

        // Check if the video actually has data for this phase
        const hasData = phaseHasDataInVideo(videoData, phase)

        if (!hasData) {
          // Phase is marked as completed but data doesn't exist - reset it
          newPhases[phase] = createInitialPhaseState()
          hasChanges = true
        }
      }

      if (!hasChanges) {
        return state
      }

      // Find the first incomplete phase to set as current
      // Default to 8 if all phases are complete
      let newCurrentPhase: WizardPhase = 8
      for (const phase of WIZARD_PHASES) {
        if (newPhases[phase].status !== 'completed') {
          newCurrentPhase = phase
          break
        }
      }

      return {
        ...state,
        currentPhase: newCurrentPhase,
        phases: newPhases,
      }
    }

    case 'HYDRATE_FROM_VIDEO_DATA': {
      // Hydrate wizard state from video data on initial mount.
      // This marks phases as 'completed' if the video has data for them.
      // Used when localStorage is empty/stale but Firestore has data.
      const { videoData } = action
      let hasChanges = false
      const newPhases = { ...state.phases }

      for (const phase of WIZARD_PHASES) {
        const phaseState = state.phases[phase]
        const hasData = phaseHasDataInVideo(videoData, phase)

        // If video has data but phase is pending, mark as completed
        if (hasData && phaseState.status === 'pending') {
          newPhases[phase] = {
            ...phaseState,
            status: 'completed',
            data: null, // Data is in Firestore, not in wizard state
          }
          hasChanges = true
        }
        // If video doesn't have data but phase is completed, reset it
        else if (!hasData && phaseState.status === 'completed') {
          newPhases[phase] = createInitialPhaseState()
          hasChanges = true
        }
      }

      if (!hasChanges) {
        return state
      }

      // Find the first incomplete phase to set as current
      // Default to 8 if all phases are complete
      let newCurrentPhase: WizardPhase = 8
      for (const phase of WIZARD_PHASES) {
        if (newPhases[phase].status !== 'completed') {
          newCurrentPhase = phase
          break
        }
      }

      return {
        ...state,
        currentPhase: newCurrentPhase,
        phases: newPhases,
      }
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
