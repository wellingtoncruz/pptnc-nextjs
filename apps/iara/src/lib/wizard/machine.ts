/**
 * Wizard state machine for managing the 8-phase video processing flow.
 *
 * The state machine handles:
 * - Phase transitions
 * - Phase status updates
 * - Data persistence per phase
 * - Cascade invalidation when reprocessing
 */

import { PHASES_BY_VIDEO_TYPE, WIZARD_PHASES } from './constants'
import type {
  ExtendedWizardPhase,
  PhaseState,
  PhaseStatus,
  VideoDataForSync,
  VideoTypeForWizard,
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
 * Check if Phase 5B has data in the video document.
 * Phase 5B is exclusive to cut videos and uses suggestedShortTitles.
 */
function phase5BHasDataInVideo(video: VideoDataForSync): boolean {
  return Array.isArray(video.suggestedShortTitles) && video.suggestedShortTitles.length > 0
}

/**
 * Get the initial phase for a video based on its type and state.
 *
 * - episode: always starts at phase 1
 * - cut/reel: starts at phase 0 if no parent selected, or phase 5 if parent exists
 *
 * IMPORTANT: Phase 0 is not a standard WizardPhase (1-8), but is supported for cut/reel videos.
 * The WizardState.currentPhase field stores this value, and the orchestrator handles rendering
 * by checking `(wizard.currentPhase as number) === 0`.
 *
 * Type Safety Note: We return 0 cast to WizardPhase because WizardState.currentPhase
 * is typed as WizardPhase, but the runtime value can be 0 for cut/reel videos.
 * This is a known type limitation - a full fix would require changing WizardState.currentPhase
 * to ExtendedWizardPhase, which would be a larger refactor affecting many files.
 */
function getInitialPhaseForVideoType(
  videoType?: 'episode' | 'cut' | 'reel',
  parentEpisodeId?: string
): WizardPhase {
  // Episode always starts at phase 1
  if (!videoType || videoType === 'episode') {
    return 1
  }

  // Cut/reel with parent already set: start at phase 5 (title)
  if (parentEpisodeId) {
    return 5
  }

  // Cut/reel without parent: start at phase 0 (parent selection)
  // Cast is necessary because WizardPhase type doesn't include 0,
  // but the orchestrator correctly handles phase 0 at runtime.
  return 0 as WizardPhase
}

/**
 * Creates the initial wizard state.
 *
 * @param videoId - The ID of the video
 * @param videoType - Video type (episode, cut, reel). Defaults to 'episode'.
 * @param parentEpisodeId - Optional parent episode ID (for cut/reel)
 */
export function createInitialWizardState(
  videoId: string,
  videoType: VideoTypeForWizard = 'episode',
  parentEpisodeId?: string
): WizardState {
  const phases = {} as Record<WizardPhase, PhaseState>

  for (const phase of WIZARD_PHASES) {
    phases[phase] = createInitialPhaseState()
  }

  return {
    videoId,
    videoType,
    currentPhase: getInitialPhaseForVideoType(videoType, parentEpisodeId),
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
      // Can only navigate to phases that are completed, pending, or needs_review
      const targetPhase = action.phase
      const targetStatus = state.phases[targetPhase].status

      // Allow navigation to completed, pending, or needs_review phases
      if (targetStatus === 'completed' || targetStatus === 'pending' || targetStatus === 'needs_review') {
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
      //
      // IMPORTANT: Uses getNextPhaseForType to respect video type's phase flow.
      // For example: cut videos go 5 → 5B → 6, not 5 → 6.
      const nextPhase = getNextPhaseForType(action.phase, state.videoType)

      // Extended phases (0 and '5B') are not tracked in the phases record.
      // They are tracked via video data (parentEpisodeId for 0, shortTitle for 5B).
      // For these phases, we only navigate - completion is determined by video data.
      const isExtendedPhase = action.phase === 0 || action.phase === '5B'

      if (isExtendedPhase) {
        return {
          ...state,
          currentPhase: (nextPhase ?? state.currentPhase) as WizardPhase,
        }
      }

      // Standard phases (1-8): update phases record and navigate
      return {
        ...state,
        // If no next phase (at last phase), stay at current phase
        currentPhase: (nextPhase ?? state.currentPhase) as WizardPhase,
        phases: {
          ...state.phases,
          [action.phase]: {
            ...state.phases[action.phase as WizardPhase],
            data: action.data,
            status: 'completed',
            error: null,
          },
        },
      }
    }

    case 'RESET': {
      return createInitialWizardState(state.videoId, state.videoType)
    }

    case 'RESET_TO_STATE': {
      // Replace entire state with new state (used when switching videos)
      return action.state
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
      //
      // FONTE DE VERDADE ÚNICA: Firestore (Video document)
      // O localStorage é apenas cache de sessão - pode divergir temporariamente
      // mas é SEMPRE corrigido pela hidratação baseada nos dados do Firestore.
      //
      // REGRA DOS DOIS CAMINHOS (Story 5.3 fix):
      // - Se Firestore TEM dados → fase tem dados (completed ou needs_review)
      // - Se Firestore NÃO tem dados → fase pending (mesmo que localStorage diga diferente)
      //
      // FASES COM ESTADO INTERMEDIÁRIO (2 e 3):
      // - Fases 2 e 3 requerem confirmação do usuário antes de serem "completed"
      // - Se tem dados mas não foi confirmado → needs_review
      // - A confirmação é rastreada via video.reviewedPhases
      //
      // CUT/REEL SUPPORT:
      // - For cut/reel videos, skip phases 1-4 when calculating first incomplete phase
      // - If no parentEpisodeId, set phase to 0 (parent selection)
      //
      // Isso garante que toda fase tem apenas dois caminhos possíveis:
      // 1. Smart Load: dados existem → exibe (e aguarda confirmação se necessário)
      // 2. LLM Call: dados não existem → processa
      const { videoData } = action
      let phasesChanged = false
      const newPhases = { ...state.phases }

      // Phases that require review confirmation before being marked as completed
      // Phases 2 (Edit Check), 3 (Compliance), and 4 (Chapters) need user confirmation
      const phasesRequiringReview: WizardPhase[] = [2, 3, 4]

      // Determine video type and which phases are applicable
      const videoType = videoData.videoType ?? 'episode'
      const isEpisode = videoType === 'episode'

      for (const phase of WIZARD_PHASES) {
        const phaseState = state.phases[phase]
        const hasData = phaseHasDataInVideo(videoData, phase)
        const requiresReview = phasesRequiringReview.includes(phase)
        const isReviewed = videoData.reviewedPhases?.includes(phase) ?? false

        // For cut/reel, skip phases 1-4 (mark as completed to allow navigation)
        if (!isEpisode && phase <= 4) {
          if (phaseState.status !== 'completed') {
            newPhases[phase] = {
              ...phaseState,
              status: 'completed',
              data: null,
            }
            phasesChanged = true
          }
          continue
        }

        if (hasData) {
          // Firestore TEM dados
          if (requiresReview && !isReviewed) {
            // Fases 2/3: tem dados mas não foi confirmado → needs_review
            if (phaseState.status !== 'needs_review') {
              newPhases[phase] = {
                ...phaseState,
                status: 'needs_review',
                data: null,
              }
              phasesChanged = true
            }
          } else {
            // Fase normal ou já confirmada → completed
            if (phaseState.status === 'pending' || phaseState.status === 'needs_review') {
              newPhases[phase] = {
                ...phaseState,
                status: 'completed',
                data: null,
              }
              phasesChanged = true
            }
          }
        } else {
          // Firestore NÃO tem dados → reseta para pending
          if (phaseState.status === 'completed' || phaseState.status === 'needs_review') {
            newPhases[phase] = {
              ...phaseState,
              status: 'pending',
              data: null,
              error: null,
            }
            phasesChanged = true
          }
        }
      }

      // Calculate the first incomplete phase
      // For cut/reel: if no parent, phase 0; otherwise start at phase 5
      // For cut: includes Phase 5B between 5 and 6
      let firstIncompletePhase: WizardPhase

      if (!isEpisode) {
        // Cut/reel video
        if (!videoData.parentEpisodeId) {
          // No parent selected - go to phase 0
          // Cast necessary - see getInitialPhaseForVideoType for explanation
          firstIncompletePhase = 0 as WizardPhase
        } else {
          // Parent selected - find first incomplete phase starting from 5
          // For cut videos, Phase 5B comes between 5 and 6
          firstIncompletePhase = 8

          // Check phase 5 first
          if (newPhases[5].status !== 'completed') {
            firstIncompletePhase = 5
          }
          // For cut: check Phase 5B (uses suggestedShortTitles)
          else if (videoType === 'cut' && !phase5BHasDataInVideo(videoData)) {
            // Phase 5 complete but 5B not complete - go to 5B
            // Cast '5B' to WizardPhase for type compatibility
            // The orchestrator handles '5B' at runtime
            firstIncompletePhase = '5B' as unknown as WizardPhase
          }
          // Then check phases 6, 7, 8
          else {
            for (const phase of [6, 7, 8] as WizardPhase[]) {
              if (newPhases[phase].status !== 'completed') {
                firstIncompletePhase = phase
                break
              }
            }
          }
        }
      } else {
        // Episode video - find first incomplete phase (1-8)
        firstIncompletePhase = 8
        for (const phase of WIZARD_PHASES) {
          if (newPhases[phase].status !== 'completed') {
            firstIncompletePhase = phase
            break
          }
        }
      }

      // Determine if currentPhase needs adjustment:
      // 1. If phases changed (completions added or removed), move to first incomplete
      // 2. If currentPhase is AHEAD of first incomplete (invalid state), correct it
      // 3. Otherwise, keep currentPhase as-is (user might be reviewing earlier phase)
      const currentPhaseAhead = state.currentPhase > firstIncompletePhase
      const shouldUpdateCurrentPhase = phasesChanged || currentPhaseAhead

      if (!shouldUpdateCurrentPhase) {
        return state
      }

      return {
        ...state,
        currentPhase: firstIncompletePhase,
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
 *
 * @deprecated Use getNextPhaseForType for proper videoType-aware navigation.
 */
export function getNextPhase(currentPhase: WizardPhase): WizardPhase | null {
  if (currentPhase >= 8) return null
  return (currentPhase + 1) as WizardPhase
}

/**
 * Gets the next phase based on the video type's phase flow.
 * Uses PHASES_BY_VIDEO_TYPE to determine the correct sequence.
 *
 * For example:
 * - episode: 5 → 6
 * - cut: 5 → '5B' → 6
 * - reel: 5 → 6
 *
 * @param currentPhase - The current phase
 * @param videoType - The video type (episode, cut, reel)
 * @returns The next phase, or null if at the last phase
 */
export function getNextPhaseForType(
  currentPhase: ExtendedWizardPhase,
  videoType: VideoTypeForWizard
): ExtendedWizardPhase | null {
  const phases = PHASES_BY_VIDEO_TYPE[videoType] ?? PHASES_BY_VIDEO_TYPE.episode
  const currentIndex = phases.indexOf(currentPhase)

  // Current phase not found in this video type's phases, or at last phase
  if (currentIndex === -1 || currentIndex >= phases.length - 1) {
    return null
  }

  return phases[currentIndex + 1]
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

  // Can always navigate to phases that need review (to confirm them)
  if (targetStatus === 'needs_review') return true

  // Can navigate to pending phase if all previous phases are completed or needs_review
  if (targetStatus === 'pending') {
    for (let phase = 1; phase < targetPhase; phase++) {
      const phaseStatus = state.phases[phase as WizardPhase].status
      if (phaseStatus !== 'completed' && phaseStatus !== 'needs_review') {
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
