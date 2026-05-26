/**
 * Wizard module - state management for the multi-phase video processing flow.
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
  VideoTypeForWizard,
  WizardAction,
  WizardState,
} from './types'

// Phase IDs (TD-7)
export {
  isWizardPhaseId,
  isTrackedPhaseId,
  isLLMPhaseId,
  phaseIdOrder,
  WIZARD_PHASE_IDS,
  TRACKED_PHASE_IDS,
  LLM_PHASE_IDS,
  type WizardPhaseId,
  type TrackedPhaseId,
  type LLMPhaseId,
} from './phase-id-map'

// Constants
export {
  PHASE_ID_METADATA,
  IMMUTABLE_PHASE_IDS,
  REPROCESSABLE_PHASE_IDS,
  PHASE_IDS_BY_VIDEO_TYPE,
  getPhaseIdsForVideoType,
  getPhaseIdsForVideoTypeWithFeatures,
  getPhaseIdsToInvalidate,
  isPhaseIdValidForVideoType,
  isReprocessablePhaseId,
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
