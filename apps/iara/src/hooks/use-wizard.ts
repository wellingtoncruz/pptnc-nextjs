'use client'

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'

import {
  canNavigateToPhase,
  ConsoleMessage,
  createInitialWizardState,
  getFirstIncompletePhase,
  getNextPhase,
  getWizardProgress,
  isTrackedPhaseId,
  isWizardComplete,
  isWizardPhaseId,
  PHASE_ID_METADATA,
  PhaseStatus,
  type TrackedPhaseId,
  TRACKED_PHASE_IDS,
  VideoDataForSync,
  type WizardPhaseId,
  WizardState,
  wizardReducer,
} from '@/lib/wizard'

/**
 * Storage key prefix for wizard state persistence.
 */
const WIZARD_STORAGE_KEY_PREFIX = 'wizard-state-'

/**
 * Persisted-state schema version. Bumped to 2 for TD-7 (Epic 25), which changed
 * the wizard state shape from numeric phases (currentPhase: 1..8, phases keyed
 * 1..8) to semantic kebab IDs (currentPhase: WizardPhaseId, phases keyed by
 * TrackedPhaseId). State persisted by an older build (no version, or numeric
 * keys) is discarded on load — no data loss, since the wizard re-hydrates from
 * Firestore (the source of truth) on the next render.
 */
const WIZARD_STATE_SCHEMA_VERSION = 2

type PersistedWizardState = WizardState & { schemaVersion?: number }

/**
 * Load wizard state from localStorage.
 *
 * Returns null (→ rebuild fresh + hydrate from Firestore) when the stored state
 * is from an older schema version or doesn't match the current kebab shape.
 */
function loadWizardState(videoId: string): WizardState | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(`${WIZARD_STORAGE_KEY_PREFIX}${videoId}`)
    if (!stored) return null

    const parsed = JSON.parse(stored) as PersistedWizardState

    // Schema gate (TD-7): discard pre-refactor state (numeric phase shape).
    if (parsed.schemaVersion !== WIZARD_STATE_SCHEMA_VERSION) return null

    // Validate the stored state has the expected shape
    if (parsed.videoId !== videoId || !parsed.phases || !parsed.currentPhase) {
      return null
    }

    // Defense-in-depth: currentPhase must be a valid semantic ID and every
    // tracked phase must be present (guards against any malformed v2 state).
    if (!isWizardPhaseId(parsed.currentPhase)) return null
    if (TRACKED_PHASE_IDS.some((id) => !parsed.phases[id])) return null

    return parsed
  } catch {
    return null
  }
}

/**
 * Save wizard state to localStorage (tagged with the current schema version).
 */
function saveWizardState(state: WizardState): void {
  if (typeof window === 'undefined') return

  try {
    const persisted: PersistedWizardState = {
      ...state,
      schemaVersion: WIZARD_STATE_SCHEMA_VERSION,
    }
    localStorage.setItem(
      `${WIZARD_STORAGE_KEY_PREFIX}${state.videoId}`,
      JSON.stringify(persisted)
    )
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

/**
 * Clear wizard state from localStorage.
 */
function clearWizardState(videoId: string): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(`${WIZARD_STORAGE_KEY_PREFIX}${videoId}`)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Initialization parameters for useWizard.
 */
interface InitParams {
  videoId: string
  videoData?: VideoDataForSync
}

/**
 * Initialize wizard state - load from storage, create new, and hydrate from video data.
 *
 * This performs hydration SYNCHRONOUSLY during initialization to ensure
 * the initial state is correct from the first render. This avoids timing
 * issues with effects where localStorage state would be stale until
 * hydration effect runs.
 */
function initializeWizardState({ videoId, videoData }: InitParams): WizardState {
  const stored = loadWizardState(videoId)
  const videoType = videoData?.videoType ?? 'episode'

  // Create initial state with video type for proper phase initialization
  let initial = stored ?? createInitialWizardState(
    videoId,
    videoType,
    videoData?.parentEpisodeId,
    videoData?.standalone
  )

  // If we have stored state but it doesn't have videoType (old format),
  // or videoType doesn't match, update it to ensure correct navigation
  if (stored && (!stored.videoType || stored.videoType !== videoType)) {
    initial = {
      ...initial,
      videoType,
    }
  }

  // If video data is provided, hydrate synchronously
  // This ensures the state is correct from the first render
  if (videoData) {
    return wizardReducer(initial, { type: 'HYDRATE_FROM_VIDEO_DATA', videoData })
  }

  return initial
}

/**
 * Hook for managing the wizard state and console messages.
 *
 * IMPORTANT: Pass video data to ensure correct initial state hydration.
 * This synchronously hydrates wizard state from video data during
 * initialization, avoiding timing issues with effects.
 *
 * Usage:
 * ```tsx
 * const wizard = useWizard(video.id, video)
 *
 * // Navigate
 * wizard.goToPhase(3)
 *
 * // Update phase
 * wizard.setPhaseLoading(1)
 * wizard.setPhaseData(1, { critique: '...' })
 *
 * // Console messages
 * wizard.addSpinner(1, 'Processing...')
 * wizard.addAlert(1, 'Success', 'Phase completed', 'success')
 * ```
 */
export function useWizard(videoId: string, videoData?: VideoDataForSync) {
  const [state, dispatch] = useReducer(
    wizardReducer,
    { videoId, videoData },
    initializeWizardState
  )

  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([])

  // Use React's useId for unique prefix + counter for guaranteed unique IDs
  const idPrefix = useId()
  const messageCounter = useRef(0)

  // Track previous videoId to detect video changes
  const previousVideoIdRef = useRef(videoId)

  // Reset state when videoId changes (user navigated to different video)
  useEffect(() => {
    if (previousVideoIdRef.current !== videoId) {
      // Video changed - reinitialize state for new video
      const newState = initializeWizardState({ videoId, videoData })
      dispatch({ type: 'RESET_TO_STATE', state: newState })
      setConsoleMessages([])
      previousVideoIdRef.current = videoId
    }
  }, [videoId, videoData])

  // Persist state changes to localStorage
  useEffect(() => {
    saveWizardState(state)
  }, [state])

  // Re-hydrate when video data changes
  // This handles cases where:
  // 1. Video prop updates after initial mount (e.g., Firestore realtime updates)
  // 2. Initial mount had partial data that gets completed
  //
  // The HYDRATE_FROM_VIDEO_DATA action is idempotent - if no changes are needed,
  // it returns the same state, so calling it multiple times is safe.
  //
  // isRehydration: true ensures currentPhase is preserved during re-hydration.
  // Only the initial hydration (in initializeWizardState) navigates to firstIncompletePhase.
  // This prevents the wizard from jumping phases when video status changes trigger re-fetch.
  useEffect(() => {
    if (!videoData) return
    dispatch({ type: 'HYDRATE_FROM_VIDEO_DATA', videoData, isRehydration: true })
  }, [videoData])

  // Navigation
  const goToPhase = useCallback(
    (phase: WizardPhaseId) => {
      // Extended phases (e.g. 'links', Epic 26) have no tracked status — navigate
      // directly; the gating is done by the caller (wizard-layout).
      if (!isTrackedPhaseId(phase)) {
        dispatch({ type: 'SET_PHASE', phase })
        return
      }
      if (canNavigateToPhase(state, phase)) {
        dispatch({ type: 'SET_PHASE', phase })
      }
    },
    [state]
  )

  const goToNextPhase = useCallback(() => {
    const next = getNextPhase(state.currentPhase)
    if (next && canNavigateToPhase(state, next)) {
      dispatch({ type: 'SET_PHASE', phase: next })
    }
  }, [state])

  // Phase status updates
  const setPhaseStatus = useCallback((phase: TrackedPhaseId, status: PhaseStatus) => {
    dispatch({ type: 'SET_PHASE_STATUS', phase, status })
  }, [])

  const setPhaseLoading = useCallback((phase: TrackedPhaseId) => {
    dispatch({ type: 'SET_PHASE_STATUS', phase, status: 'loading' })
  }, [])

  const setPhaseData = useCallback((phase: TrackedPhaseId, data: unknown) => {
    dispatch({ type: 'SET_PHASE_DATA', phase, data })
  }, [])

  const setPhaseError = useCallback((phase: TrackedPhaseId, error: string) => {
    dispatch({ type: 'SET_PHASE_ERROR', phase, error })
  }, [])

  const invalidateFromPhase = useCallback((phase: WizardPhaseId) => {
    dispatch({ type: 'INVALIDATE_FROM_PHASE', phase })
  }, [])

  /**
   * Complete the current phase and advance to the next one.
   * This is a combined action that avoids stale state issues
   * when calling setPhaseData + goToNextPhase separately.
   *
   * Supports extended phases (0 and '5B') for cut/reel videos.
   * Extended phases don't update the phases record - their completion
   * is tracked via video data (parentEpisodeId for 0, shortTitle for 5B).
   */
  /**
   * @param features Optional podcast features. Pass `{ thumbnailGeneration: true }`
   * to make the wizard route from Tags (7) to 'THUMB' instead of jumping to
   * Publicar (8). Without this, the state machine falls back to the legacy
   * sequence and SKIPS the Thumbnail phase silently. Epic 22 / Story 22.3a.
   */
  const completePhaseAndAdvance = useCallback(
    (
      phase: WizardPhaseId,
      data: unknown,
      features?: { thumbnailGeneration?: boolean },
      standalone?: boolean
    ) => {
      dispatch({ type: 'COMPLETE_PHASE_AND_ADVANCE', phase, data, features, standalone })
    },
    []
  )

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
    setConsoleMessages([])
    clearWizardState(videoId)
  }, [videoId])

  /**
   * Sync wizard state with actual video data from Firestore.
   * Resets phases that are marked as completed in localStorage
   * but don't have corresponding data in Firestore.
   */
  const syncWithVideoData = useCallback((videoData: VideoDataForSync) => {
    dispatch({ type: 'SYNC_WITH_VIDEO_DATA', videoData })
  }, [])

  /**
   * Hydrate wizard state from video data on initial mount.
   * Marks phases as completed if video has data for them.
   * Used when localStorage is empty/stale but Firestore has data.
   */
  const hydrateFromVideoData = useCallback((videoData: VideoDataForSync) => {
    dispatch({ type: 'HYDRATE_FROM_VIDEO_DATA', videoData })
  }, [])

  /**
   * Re-initialize the wizard state from fresh video data, discarding the cached
   * localStorage state. Used when an editorial change reshapes the phase flow —
   * e.g. toggling the `standalone` flag (Epic 25), which removes/restores the
   * parent phase. A plain re-hydration cannot move currentPhase off a now-removed
   * phase (the HYDRATE guard keeps currentPhase when it is behind firstIncomplete
   * and nothing changed), so we rebuild the state from scratch with the new data.
   */
  const reinitializeFromVideo = useCallback(
    (videoData: VideoDataForSync) => {
      clearWizardState(videoId)
      const fresh = initializeWizardState({ videoId, videoData })
      dispatch({ type: 'RESET_TO_STATE', state: fresh })
    },
    [videoId]
  )

  // Console message management
  const addSpinner = useCallback((phase: WizardPhaseId, text?: string) => {
    const messageId = `${idPrefix}-spinner-${phase}-${++messageCounter.current}`
    const message: ConsoleMessage = {
      id: messageId,
      phase,
      type: 'spinner',
      timestamp: new Date(),
      spinnerText: text ?? PHASE_ID_METADATA[phase].spinnerText,
    }
    setConsoleMessages((prev) => [...prev, message])
    return message.id
  }, [idPrefix])

  const removeSpinner = useCallback((spinnerId: string) => {
    setConsoleMessages((prev) => prev.filter((m) => m.id !== spinnerId))
  }, [])

  const addAlert = useCallback(
    (
      phase: WizardPhaseId,
      title: string,
      text: string,
      severity: ConsoleMessage['alertSeverity'] = 'info'
    ) => {
      const messageId = `${idPrefix}-alert-${phase}-${++messageCounter.current}`
      const message: ConsoleMessage = {
        id: messageId,
        phase,
        type: 'alert',
        timestamp: new Date(),
        alertTitle: title,
        alertText: text,
        alertSeverity: severity,
      }
      setConsoleMessages((prev) => [...prev, message])
      return message.id
    },
    [idPrefix]
  )

  const clearConsole = useCallback(() => {
    setConsoleMessages([])
  }, [])

  // Computed values
  const currentPhaseData = useMemo(
    () =>
      isTrackedPhaseId(state.currentPhase) ? state.phases[state.currentPhase] : undefined,
    [state.phases, state.currentPhase]
  )

  const currentPhaseMetadata = useMemo(
    () => PHASE_ID_METADATA[state.currentPhase],
    [state.currentPhase]
  )

  const progress = useMemo(() => getWizardProgress(state), [state])

  const isComplete = useMemo(() => isWizardComplete(state), [state])

  const firstIncompletePhase = useMemo(() => getFirstIncompletePhase(state), [state])

  // Memoize canNavigateToPhase to avoid creating new function on every render
  const canNavigateToPhaseCallback = useCallback(
    (phase: TrackedPhaseId) => canNavigateToPhase(state, phase),
    [state]
  )

  return {
    // State
    state,
    currentPhase: state.currentPhase,
    currentPhaseData,
    currentPhaseMetadata,
    progress,
    isComplete,
    firstIncompletePhase,

    // Navigation
    goToPhase,
    goToNextPhase,
    canNavigateToPhase: canNavigateToPhaseCallback,

    // Phase updates
    setPhaseStatus,
    setPhaseLoading,
    setPhaseData,
    setPhaseError,
    invalidateFromPhase,
    completePhaseAndAdvance,
    reset,
    syncWithVideoData,
    hydrateFromVideoData,
    reinitializeFromVideo,

    // Console
    consoleMessages,
    addSpinner,
    removeSpinner,
    addAlert,
    clearConsole,
  }
}

export type UseWizardReturn = ReturnType<typeof useWizard>
