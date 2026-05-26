/**
 * Phase validation module for smart loading of wizard phases.
 *
 * Provides utilities to:
 * - Validate phase completion status
 * - Determine first incomplete phase for auto-navigation
 * - Check if the edit-check and risk phases require review confirmation
 *
 * @see Story 5.3 - Smart Loading de Fases Imutaveis
 */

import type { Video } from '@/types/video'
import { TRACKED_PHASE_IDS, type TrackedPhaseId } from './phase-id-map'

/**
 * Result of validating a phase's completion status.
 */
export interface PhaseValidation {
  /** Semantic phase id (TrackedPhaseId) */
  phase: TrackedPhaseId
  /** Phase has all criteria satisfied (including review if applicable) */
  isComplete: boolean
  /** Data for this phase exists in Firestore */
  hasData: boolean
  /** edit-check or risk - requires review confirmation */
  requiresReview: boolean
  /** Producer has confirmed review (for edit-check and risk) */
  isReviewed: boolean
}

/**
 * Mapping of phase -> data field in Video type.
 * Null means phase has special handling (e.g., publish checks status).
 *
 * Note: the title phase uses 'suggestedTitles' (LLM output) not 'title' (user
 * selection). The phase is complete when the LLM has generated suggestions,
 * regardless of the user's choice.
 */
const DATA_FIELDS: Record<TrackedPhaseId, keyof Video | null> = {
  critique: 'critique',
  'edit-check': 'editingIssues',
  risk: 'riskAndCompliance',
  chapters: 'chapters',
  title: 'suggestedTitles', // LLM-generated suggestions, not user-selected title
  description: 'description',
  tags: 'tags',
  publish: null, // publish checks status === 'sent'
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
 * - edit-check, risk: Empty arrays ARE valid (means "no issues found")
 * - chapters, tags: Empty arrays are NOT valid (need actual content)
 */
function phaseHasData(video: Video, phase: TrackedPhaseId): boolean {
  const field = DATA_FIELDS[phase]
  if (!field) return false

  const value = video[field]

  // Arrays have special handling per phase
  if (Array.isArray(value)) {
    // edit-check and risk: Empty array = "no issues" which is valid data
    if (phase === 'edit-check' || phase === 'risk') {
      return true // Array exists (even if empty)
    }
    // chapters and tags: Need actual content
    return value.length > 0
  }

  return hasValue(value)
}

/**
 * Validate completion status of a specific phase.
 *
 * Rules:
 * - critique, chapters, title, description, tags: Complete if data field exists and has value
 * - edit-check, risk: Complete if data exists AND phase has been reviewed
 * - publish: Complete if video.status === 'sent'
 *
 * @param video - Video document to validate
 * @param phase - Phase id to validate
 * @returns Validation result with completion status and metadata
 */
export function validatePhaseCompletion(video: Video, phase: TrackedPhaseId): PhaseValidation {
  const requiresReview = phase === 'edit-check' || phase === 'risk'
  const isReviewed = video.reviewedPhases?.includes(phase) ?? false

  // publish: check if video was sent to YouTube
  if (phase === 'publish') {
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

  // edit-check and risk require review confirmation even if data exists
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
 * Returns 'publish' if all phases are complete.
 *
 * @param video - Video document to analyze
 * @returns First incomplete tracked phase id
 */
export function getFirstIncompletePhase(video: Video): TrackedPhaseId {
  for (const phase of TRACKED_PHASE_IDS) {
    const validation = validatePhaseCompletion(video, phase)
    if (!validation.isComplete) {
      return phase
    }
  }
  return 'publish' // All phases complete
}

/**
 * Get validation results for all phases.
 *
 * Useful for displaying overall progress or debugging.
 *
 * @param video - Video document to analyze
 * @returns Array of validation results for all tracked phases
 */
export function getAllPhaseValidations(video: Video): PhaseValidation[] {
  return TRACKED_PHASE_IDS.map((phase) => validatePhaseCompletion(video, phase))
}

/**
 * Check if a phase needs review confirmation.
 *
 * Only edit-check and risk require explicit confirmation from the producer
 * before being considered complete.
 *
 * @param video - Video document to check
 * @param phase - Phase id to check
 * @returns True if phase has data but needs review confirmation
 */
export function phaseNeedsReviewConfirmation(video: Video, phase: TrackedPhaseId): boolean {
  const validation = validatePhaseCompletion(video, phase)
  return validation.hasData && validation.requiresReview && !validation.isReviewed
}
