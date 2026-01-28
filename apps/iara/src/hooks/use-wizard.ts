'use client'

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'

import {
  canNavigateToPhase,
  ConsoleMessage,
  createInitialWizardState,
  getFirstIncompletePhase,
  getNextPhase,
  getWizardProgress,
  isWizardComplete,
  PHASE_METADATA,
  PhaseStatus,
  WizardPhase,
  WizardState,
  wizardReducer,
} from '@/lib/wizard'

/**
 * Storage key prefix for wizard state persistence.
 */
const WIZARD_STORAGE_KEY_PREFIX = 'wizard-state-'

/**
 * Load wizard state from localStorage.
 */
function loadWizardState(videoId: string): WizardState | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(`${WIZARD_STORAGE_KEY_PREFIX}${videoId}`)
    if (!stored) return null

    const parsed = JSON.parse(stored) as WizardState

    // Validate the stored state has the expected shape
    if (parsed.videoId !== videoId || !parsed.phases || !parsed.currentPhase) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

/**
 * Save wizard state to localStorage.
 */
function saveWizardState(state: WizardState): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(
      `${WIZARD_STORAGE_KEY_PREFIX}${state.videoId}`,
      JSON.stringify(state)
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
 * Initialize wizard state - load from storage or create new.
 */
function initializeWizardState(videoId: string): WizardState {
  const stored = loadWizardState(videoId)
  return stored ?? createInitialWizardState(videoId)
}

/**
 * Hook for managing the wizard state and console messages.
 *
 * Usage:
 * ```tsx
 * const wizard = useWizard('video-123')
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
export function useWizard(videoId: string) {
  const [state, dispatch] = useReducer(
    wizardReducer,
    videoId,
    initializeWizardState
  )

  const [consoleMessages, setConsoleMessages] = useState<ConsoleMessage[]>([])

  // Use React's useId for unique prefix + counter for guaranteed unique IDs
  const idPrefix = useId()
  const messageCounter = useRef(0)

  // Persist state changes to localStorage
  useEffect(() => {
    saveWizardState(state)
  }, [state])

  // Navigation
  const goToPhase = useCallback(
    (phase: WizardPhase) => {
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
  const setPhaseStatus = useCallback((phase: WizardPhase, status: PhaseStatus) => {
    dispatch({ type: 'SET_PHASE_STATUS', phase, status })
  }, [])

  const setPhaseLoading = useCallback((phase: WizardPhase) => {
    dispatch({ type: 'SET_PHASE_STATUS', phase, status: 'loading' })
  }, [])

  const setPhaseData = useCallback((phase: WizardPhase, data: unknown) => {
    dispatch({ type: 'SET_PHASE_DATA', phase, data })
  }, [])

  const setPhaseError = useCallback((phase: WizardPhase, error: string) => {
    dispatch({ type: 'SET_PHASE_ERROR', phase, error })
  }, [])

  const invalidateFromPhase = useCallback((phase: WizardPhase) => {
    dispatch({ type: 'INVALIDATE_FROM_PHASE', phase })
  }, [])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
    setConsoleMessages([])
    clearWizardState(videoId)
  }, [videoId])

  // Console message management
  const addSpinner = useCallback((phase: WizardPhase, text?: string) => {
    const messageId = `${idPrefix}-spinner-${phase}-${++messageCounter.current}`
    const message: ConsoleMessage = {
      id: messageId,
      phase,
      type: 'spinner',
      timestamp: new Date(),
      spinnerText: text ?? PHASE_METADATA[phase].spinnerText,
    }
    setConsoleMessages((prev) => [...prev, message])
    return message.id
  }, [idPrefix])

  const removeSpinner = useCallback((spinnerId: string) => {
    setConsoleMessages((prev) => prev.filter((m) => m.id !== spinnerId))
  }, [])

  const addAlert = useCallback(
    (
      phase: WizardPhase,
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
    () => state.phases[state.currentPhase],
    [state.phases, state.currentPhase]
  )

  const currentPhaseMetadata = useMemo(
    () => PHASE_METADATA[state.currentPhase],
    [state.currentPhase]
  )

  const progress = useMemo(() => getWizardProgress(state), [state])

  const isComplete = useMemo(() => isWizardComplete(state), [state])

  const firstIncompletePhase = useMemo(() => getFirstIncompletePhase(state), [state])

  // Memoize canNavigateToPhase to avoid creating new function on every render
  const canNavigateToPhaseCallback = useCallback(
    (phase: WizardPhase) => canNavigateToPhase(state, phase),
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
    reset,

    // Console
    consoleMessages,
    addSpinner,
    removeSpinner,
    addAlert,
    clearConsole,
  }
}

export type UseWizardReturn = ReturnType<typeof useWizard>
