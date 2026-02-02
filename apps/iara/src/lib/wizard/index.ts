/**
 * Wizard module - state management for the 8-phase video processing flow.
 */

// Types
export type {
  AlertSeverity,
  ConsoleMessage,
  ConsoleMessageType,
  ExtendedWizardPhase,
  PhaseMetadata,
  PhaseState,
  PhaseStatus,
  PhaseType,
  VideoDataForSync,
  VideoTypeForWizard,
  WizardAction,
  WizardPhase,
  WizardState,
} from './types'

// Schemas
export { WizardPhaseSchema } from './types'

// Constants
export {
  EXTENDED_PHASE_METADATA,
  IMMUTABLE_PHASES,
  PHASE_METADATA,
  PHASES_BY_VIDEO_TYPE,
  REPROCESSABLE_PHASES,
  WIZARD_PHASES,
  getPhasesForVideoType,
  getPhasesToInvalidate,
  isPhaseValidForVideoType,
  isReprocessablePhase,
} from './constants'

// State machine
export {
  canNavigateToPhase,
  createInitialWizardState,
  getFirstIncompletePhase,
  getNextPhase,
  getNextPhaseForType,
  getPreviousPhase,
  getWizardProgress,
  isWizardComplete,
  wizardReducer,
} from './machine'

// Phase names
export { getNextPhaseName, getNextPhaseNameForType, PHASE_NAMES } from './phase-names'

// Phase validation (smart loading)
export {
  getAllPhaseValidations,
  getFirstIncompletePhase as getFirstIncompletePhaseFromVideo,
  phaseNeedsReviewConfirmation,
  validatePhaseCompletion,
  type PhaseValidation,
} from './phase-validation'
