/**
 * Wizard module - state management for the 8-phase video processing flow.
 */

// Types
export type {
  AlertSeverity,
  ConsoleMessage,
  ConsoleMessageType,
  PhaseMetadata,
  PhaseState,
  PhaseStatus,
  PhaseType,
  VideoDataForSync,
  WizardAction,
  WizardPhase,
  WizardState,
} from './types'

// Schemas
export { WizardPhaseSchema } from './types'

// Constants
export {
  IMMUTABLE_PHASES,
  PHASE_METADATA,
  REPROCESSABLE_PHASES,
  WIZARD_PHASES,
  getPhasesToInvalidate,
  isReprocessablePhase,
} from './constants'

// State machine
export {
  canNavigateToPhase,
  createInitialWizardState,
  getFirstIncompletePhase,
  getNextPhase,
  getPreviousPhase,
  getWizardProgress,
  isWizardComplete,
  wizardReducer,
} from './machine'

// Phase names
export { getNextPhaseName, PHASE_NAMES } from './phase-names'

// Phase validation (smart loading)
export {
  getAllPhaseValidations,
  getFirstIncompletePhase as getFirstIncompletePhaseFromVideo,
  phaseNeedsReviewConfirmation,
  validatePhaseCompletion,
  type PhaseValidation,
} from './phase-validation'
