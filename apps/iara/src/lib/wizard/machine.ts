/**
 * Wizard state machine for managing the multi-phase video processing flow.
 *
 * The state machine handles:
 * - Phase transitions
 * - Phase status updates
 * - Data persistence per phase
 * - Cascade invalidation when reprocessing
 *
 * TD-7 (Epic 25): phases are identified by semantic `WizardPhaseId` (kebab-case).
 * `state.phases` is keyed by `TrackedPhaseId` (the former numeric 1-8). The
 * extended phases (`parent`, `short-title`, `thumbnail`) are not tracked in the
 * record — their completion is derived from video data. Numbers survive only at
 * serialization boundaries (Firestore `reviewedPhases`), bridged via the mapper.
 */

import { getPhaseIdsForVideoTypeWithFeatures } from './constants'
import {
  TRACKED_PHASE_IDS,
  isTrackedPhaseId,
  phaseIdOrder,
  type TrackedPhaseId,
  type WizardPhaseId,
} from './phase-id-map'
import type {
  PhaseState,
  PhaseStatus,
  VideoDataForSync,
  VideoTypeForWizard,
  WizardAction,
  WizardState,
} from './types'

/** Phases skipped (auto-completed) for cut/reel — the former immutable phases 1-4. */
const IMMUTABLE_SKIP_PHASES: readonly TrackedPhaseId[] = ['critique', 'edit-check', 'risk', 'chapters']

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
function phaseHasDataInVideo(video: VideoDataForSync, phase: TrackedPhaseId): boolean {
  switch (phase) {
    case 'critique':
      return typeof video.critique === 'string' && video.critique.trim().length > 0
    case 'edit-check':
      // editingIssues: array existence means data exists (empty = no issues found)
      return video.editingIssues !== undefined
    case 'risk':
      // riskAndCompliance: array existence means data exists (empty = no risks found)
      return video.riskAndCompliance !== undefined
    case 'chapters':
      // chapters: must have actual content
      return Array.isArray(video.chapters) && video.chapters.length > 0
    case 'title':
      // title checks suggestedTitles (LLM output), NOT title (YouTube provisional title)
      return Array.isArray(video.suggestedTitles) && video.suggestedTitles.length > 0
    case 'description':
      return typeof video.description === 'string' && video.description.trim().length > 0
    case 'tags':
      // tags: must have actual content
      return Array.isArray(video.tags) && video.tags.length > 0
    case 'publish':
      return video.status === 'sent'
    default:
      return false
  }
}

/**
 * Check if the short-title phase has data in the video document.
 * Short-title is exclusive to cut videos and uses suggestedShortTitles.
 */
function shortTitleHasDataInVideo(video: VideoDataForSync): boolean {
  return Array.isArray(video.suggestedShortTitles) && video.suggestedShortTitles.length > 0
}

/**
 * Get the initial phase for a video based on its type and state.
 *
 * - episode: always starts at 'critique'
 * - cut/reel: starts at 'parent' if no parent selected, or 'title' if parent exists
 */
function getInitialPhaseForVideoType(
  videoType?: VideoTypeForWizard,
  parentEpisodeId?: string,
  standalone = false
): WizardPhaseId {
  // Episode always starts at the first phase
  if (!videoType || videoType === 'episode') {
    return 'critique'
  }

  // Standalone cut/reel (Epic 25) skip parent selection — there is no parent.
  if (standalone) {
    return 'title'
  }

  // Cut/reel with parent already set: start at 'title'
  if (parentEpisodeId) {
    return 'title'
  }

  // Cut/reel without parent: start at 'parent' (parent selection)
  return 'parent'
}

/**
 * Creates the initial wizard state.
 *
 * @param videoId - The ID of the video
 * @param videoType - Video type (episode, cut, reel). Defaults to 'episode'.
 * @param parentEpisodeId - Optional parent episode ID (for cut/reel)
 * @param standalone - Editorial flag (Epic 25): standalone cut/reel skip parent
 */
export function createInitialWizardState(
  videoId: string,
  videoType: VideoTypeForWizard = 'episode',
  parentEpisodeId?: string,
  standalone = false
): WizardState {
  const phases = {} as Record<TrackedPhaseId, PhaseState>

  for (const phase of TRACKED_PHASE_IDS) {
    phases[phase] = createInitialPhaseState()
  }

  return {
    videoId,
    videoType,
    currentPhase: getInitialPhaseForVideoType(videoType, parentEpisodeId, standalone),
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
      // Invalidate all tracked phases AFTER the given phase (canonical order)
      const newPhases = { ...state.phases }
      const fromOrder = phaseIdOrder(action.phase)

      for (const phase of TRACKED_PHASE_IDS) {
        if (phaseIdOrder(phase) > fromOrder) {
          newPhases[phase] = createInitialPhaseState()
        }
      }

      return {
        ...state,
        phases: newPhases,
      }
    }

    case 'COMPLETE_PHASE_AND_ADVANCE': {
      // Combined action: mark phase as completed AND navigate to next phase.
      // Uses getNextPhaseForType to respect video type's phase flow.
      // For example: cut videos go title → short-title → description, not title → description.
      // When features.thumbnailGeneration is on (Epic 22), the sequence inserts
      // 'thumbnail' between tags and publish for episode and cut.
      const nextPhase = getNextPhaseForType(
        action.phase,
        state.videoType,
        action.features,
        action.standalone
      )

      // Extended phases (parent, short-title, thumbnail) are not tracked in the
      // phases record — they are tracked via video data (parentEpisodeId,
      // shortTitle, storageThumbnailUrl). For these phases, we only navigate.
      if (!isTrackedPhaseId(action.phase)) {
        return {
          ...state,
          currentPhase: nextPhase ?? state.currentPhase,
        }
      }

      // Tracked phases: update phases record and navigate
      return {
        ...state,
        // If no next phase (at last phase), stay at current phase
        currentPhase: nextPhase ?? state.currentPhase,
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

      for (const phase of TRACKED_PHASE_IDS) {
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

      // Find the first incomplete phase to set as current.
      // Default to the last phase if all phases are complete.
      let newCurrentPhase: WizardPhaseId = 'publish'
      for (const phase of TRACKED_PHASE_IDS) {
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
      // FASES COM ESTADO INTERMEDIÁRIO (edit-check, risk, chapters):
      // - Requerem confirmação do usuário antes de serem "completed"
      // - Se tem dados mas não foi confirmado → needs_review
      // - A confirmação é rastreada via video.reviewedPhases (numérico no Firestore)
      //
      // CUT/REEL SUPPORT:
      // - For cut/reel videos, skip the immutable phases when calculating first incomplete
      // - If no parentEpisodeId, set phase to 'parent' (parent selection)
      const { videoData } = action
      let phasesChanged = false
      const newPhases = { ...state.phases }

      // Phases that require review confirmation before being marked as completed
      const phasesRequiringReview: TrackedPhaseId[] = ['edit-check', 'risk', 'chapters']

      // Determine video type and which phases are applicable
      const videoType = videoData.videoType ?? 'episode'
      const isEpisode = videoType === 'episode'

      for (const phase of TRACKED_PHASE_IDS) {
        const phaseState = state.phases[phase]
        const hasData = phaseHasDataInVideo(videoData, phase)
        const requiresReview = phasesRequiringReview.includes(phase)
        // reviewedPhases is numeric in Firestore — bridge via the mapper.
        const isReviewed =
          videoData.reviewedPhases?.includes(phase) ?? false

        // For cut/reel, skip the immutable phases (mark as completed to allow navigation)
        if (!isEpisode && IMMUTABLE_SKIP_PHASES.includes(phase)) {
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
            // tem dados mas não foi confirmado → needs_review
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

      // Re-hydration: only update phase statuses, preserve currentPhase.
      if (action.isRehydration) {
        if (!phasesChanged) {
          return state
        }
        return {
          ...state,
          phases: newPhases,
          // currentPhase is intentionally NOT changed during re-hydration
        }
      }

      // Calculate the first incomplete phase (only needed for initial hydration).
      // For cut/reel: if no parent, 'parent'; otherwise start at 'title'.
      // For cut: includes 'short-title' between title and description.
      let firstIncompletePhase: WizardPhaseId

      if (!isEpisode) {
        // Cut/reel video
        if (!videoData.standalone && !videoData.parentEpisodeId) {
          // No parent selected (and not standalone) - go to parent selection
          firstIncompletePhase = 'parent'
        } else {
          // Parent selected OR standalone (no parent phase) - find first
          // incomplete phase starting from 'title'
          firstIncompletePhase = 'publish'

          if (newPhases.title.status !== 'completed') {
            firstIncompletePhase = 'title'
          }
          // For cut: check short-title (uses suggestedShortTitles)
          else if (videoType === 'cut' && !shortTitleHasDataInVideo(videoData)) {
            firstIncompletePhase = 'short-title'
          }
          // Then check description, tags, publish
          else {
            for (const phase of ['description', 'tags', 'publish'] as TrackedPhaseId[]) {
              if (newPhases[phase].status !== 'completed') {
                firstIncompletePhase = phase
                break
              }
            }
          }
        }
      } else {
        // Episode video - find first incomplete phase
        firstIncompletePhase = 'publish'
        for (const phase of TRACKED_PHASE_IDS) {
          if (newPhases[phase].status !== 'completed') {
            firstIncompletePhase = phase
            break
          }
        }
      }

      // Initial hydration: navigate to firstIncompletePhase.
      const currentPhaseAhead = phaseIdOrder(state.currentPhase) > phaseIdOrder(firstIncompletePhase)
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
 * Gets the next phase after the current one (canonical order, video-type-agnostic).
 * Returns null if already at the last phase.
 *
 * @deprecated Use getNextPhaseForType for proper videoType-aware navigation.
 */
export function getNextPhase(currentPhase: WizardPhaseId): TrackedPhaseId | null {
  // Walk the tracked sequence: the deprecated helper only steps through tracked phases.
  const idx = TRACKED_PHASE_IDS.indexOf(currentPhase as TrackedPhaseId)
  if (idx === -1) return null
  if (idx >= TRACKED_PHASE_IDS.length - 1) return null
  return TRACKED_PHASE_IDS[idx + 1]
}

/**
 * Gets the next phase based on the video type's phase flow.
 *
 * For example:
 * - episode: title → description
 * - cut: title → short-title → description
 * - reel: title → description
 *
 * When `features.thumbnailGeneration` is on (Epic 22) the sequence inserts
 * 'thumbnail' between tags and publish for episode and cut.
 *
 * When `standalone` is true (Epic 25) the podcast-only phases are dropped, so
 * navigation follows the standalone sequence (e.g. cut: title → short-title).
 *
 * @returns The next phase, or null if at the last phase
 */
export function getNextPhaseForType(
  currentPhase: WizardPhaseId,
  videoType: VideoTypeForWizard,
  features?: { thumbnailGeneration?: boolean },
  standalone = false
): WizardPhaseId | null {
  const phases = getPhaseIdsForVideoTypeWithFeatures(videoType, features, standalone)
  const currentIndex = phases.indexOf(currentPhase)

  // Current phase not found in this video type's phases, or at last phase
  if (currentIndex === -1 || currentIndex >= phases.length - 1) {
    return null
  }

  return phases[currentIndex + 1]
}

/**
 * Gets the previous tracked phase before the current one (canonical order).
 * Returns null if already at the first tracked phase.
 */
export function getPreviousPhase(currentPhase: WizardPhaseId): WizardPhaseId | null {
  const idx = TRACKED_PHASE_IDS.indexOf(currentPhase as TrackedPhaseId)
  if (idx <= 0) return null
  return TRACKED_PHASE_IDS[idx - 1]
}

/**
 * Checks if a phase can be navigated to.
 * A phase can be navigated to if:
 * - It's completed (can review)
 * - It's the first pending phase after completed phases (can work on)
 */
export function canNavigateToPhase(state: WizardState, targetPhase: TrackedPhaseId): boolean {
  const targetStatus = state.phases[targetPhase].status

  // Can always navigate to completed phases
  if (targetStatus === 'completed') return true

  // Can always navigate to phases that need review (to confirm them)
  if (targetStatus === 'needs_review') return true

  // Can navigate to pending phase if all previous phases are completed or needs_review
  if (targetStatus === 'pending') {
    const targetOrder = phaseIdOrder(targetPhase)
    for (const phase of TRACKED_PHASE_IDS) {
      if (phaseIdOrder(phase) >= targetOrder) break
      const phaseStatus = state.phases[phase].status
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
 * Gets the first incomplete phase (first non-completed tracked phase).
 */
export function getFirstIncompletePhase(state: WizardState): TrackedPhaseId {
  for (const phase of TRACKED_PHASE_IDS) {
    if (state.phases[phase].status !== 'completed') {
      return phase
    }
  }
  return 'publish' // All completed, return last phase
}

/**
 * Checks if all phases are completed.
 */
export function isWizardComplete(state: WizardState): boolean {
  return TRACKED_PHASE_IDS.every((phase) => state.phases[phase].status === 'completed')
}

/**
 * Gets the overall progress percentage (0-100).
 */
export function getWizardProgress(state: WizardState): number {
  const completedCount = TRACKED_PHASE_IDS.filter(
    (phase) => state.phases[phase].status === 'completed'
  ).length
  return Math.round((completedCount / TRACKED_PHASE_IDS.length) * 100)
}
