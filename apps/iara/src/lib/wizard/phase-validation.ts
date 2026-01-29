/**
 * Phase validation module for smart loading of wizard phases.
 *
 * Provides utilities to:
 * - Validate phase completion status
 * - Determine first incomplete phase for auto-navigation
 * - Check if phases 2 and 3 require review confirmation
 *
 * @see Story 5.3 - Smart Loading de Fases Imutaveis
 */

import type { Video } from '@/types/video'
import type { WizardPhase } from './types'

/**
 * Result of validating a phase's completion status.
 */
export interface PhaseValidation {
  /** Phase number (1-8) */
  phase: WizardPhase
  /** Phase has all criteria satisfied (including review if applicable) */
  isComplete: boolean
  /** Data for this phase exists in Firestore */
  hasData: boolean
  /** Phase 2 or 3 - requires review confirmation */
  requiresReview: boolean
  /** Producer has confirmed review (for phases 2 and 3) */
  isReviewed: boolean
}

/**
 * Mapping of phase -> data field in Video type.
 * Null means phase has special handling (e.g., phase 8 checks status).
 *
 * Note: Phase 5 uses 'suggestedTitles' (LLM output) not 'title' (user selection).
 * The phase is complete when LLM has generated suggestions, regardless of user choice.
 */
const DATA_FIELDS: Record<WizardPhase, keyof Video | null> = {
  1: 'critique',
  2: 'editingIssues',
  3: 'riskAndCompliance',
  4: 'chapters',
  5: 'suggestedTitles', // LLM-generated suggestions, not user-selected title
  6: 'description',
  7: 'tags',
  8: null, // Phase 8 checks status === 'sent'
}

/**
 * Helper to check if a value exists.
 *
 * For strings: must have content (not empty/whitespace)
 * For other types: must not be undefined/null
 */
function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

/**
 * Check if a phase has data based on its field.
 *
 * Special handling:
 * - Phases 2, 3: Empty arrays ARE valid (means "no issues found")
 * - Phases 4, 7: Empty arrays are NOT valid (need actual content)
 */
function phaseHasData(video: Video, phase: WizardPhase): boolean {
  const field = DATA_FIELDS[phase]
  if (!field) return false

  const value = video[field]

  // Arrays have special handling per phase
  if (Array.isArray(value)) {
    // Phases 2 and 3: Empty array = "no issues" which is valid data
    if (phase === 2 || phase === 3) {
      return true // Array exists (even if empty)
    }
    // Phases 4 (chapters) and 7 (tags): Need actual content
    return value.length > 0
  }

  return hasValue(value)
}

/**
 * Validate completion status of a specific phase.
 *
 * Rules:
 * - Phase 1, 4, 5, 6, 7: Complete if data field exists and has value
 * - Phase 2, 3: Complete if data exists AND phase has been reviewed
 * - Phase 8: Complete if video.status === 'sent'
 *
 * @param video - Video document to validate
 * @param phase - Phase number to validate
 * @returns Validation result with completion status and metadata
 */
export function validatePhaseCompletion(video: Video, phase: WizardPhase): PhaseValidation {
  const field = DATA_FIELDS[phase]
  const requiresReview = phase === 2 || phase === 3
  const isReviewed = video.reviewedPhases?.includes(phase) ?? false

  // Phase 8: check if video was sent to YouTube
  if (phase === 8) {
    const isSent = video.status === 'sent'
    return {
      phase,
      isComplete: isSent,
      hasData: isSent,
      requiresReview: false,
      isReviewed: false,
    }
  }

  // Other phases: check if data field exists and has value
  const hasData = phaseHasData(video, phase)

  // Phases 2 and 3 require review confirmation even if data exists
  // Other phases are complete as soon as they have data
  const isComplete = requiresReview
    ? hasData && isReviewed
    : hasData

  return { phase, isComplete, hasData, requiresReview, isReviewed }
}

/**
 * Get the first incomplete phase for a video.
 *
 * Used for auto-navigation when opening a video in the wizard.
 * Returns phase 8 if all phases are complete.
 *
 * @param video - Video document to analyze
 * @returns First incomplete phase (1-8)
 */
export function getFirstIncompletePhase(video: Video): WizardPhase {
  for (let phase = 1; phase <= 8; phase++) {
    const validation = validatePhaseCompletion(video, phase as WizardPhase)
    if (!validation.isComplete) {
      return phase as WizardPhase
    }
  }
  return 8 // All phases complete
}

/**
 * Get validation results for all phases.
 *
 * Useful for displaying overall progress or debugging.
 *
 * @param video - Video document to analyze
 * @returns Array of validation results for phases 1-8
 */
export function getAllPhaseValidations(video: Video): PhaseValidation[] {
  return ([1, 2, 3, 4, 5, 6, 7, 8] as WizardPhase[]).map(phase =>
    validatePhaseCompletion(video, phase)
  )
}

/**
 * Check if a phase needs review confirmation.
 *
 * Only phases 2 (Edit Check) and 3 (Compliance) require explicit
 * confirmation from the producer before being considered complete.
 *
 * @param video - Video document to check
 * @param phase - Phase number to check
 * @returns True if phase has data but needs review confirmation
 */
export function phaseNeedsReviewConfirmation(video: Video, phase: WizardPhase): boolean {
  const validation = validatePhaseCompletion(video, phase)
  return validation.hasData && validation.requiresReview && !validation.isReviewed
}
