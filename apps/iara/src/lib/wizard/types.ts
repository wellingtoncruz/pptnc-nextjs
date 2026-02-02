/**
 * Wizard types for the 8-phase video processing flow.
 *
 * The wizard guides producers through:
 * 1. Critique (immutable)
 * 2. Edit Check (immutable)
 * 3. Compliance (immutable)
 * 4. Chapters (immutable)
 * 5. Title (reprocessable)
 * 6. Description (reprocessable)
 * 7. Tags (reprocessable)
 * 8. Publish (final)
 */

import { z } from 'zod'

/**
 * Zod schema for validating wizard phase numbers.
 * Phases 1-7 have LLM calls, phase 8 is YouTube API only.
 */
export const WizardPhaseSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
])

/**
 * The 8 phases of the wizard.
 */
export type WizardPhase = z.infer<typeof WizardPhaseSchema>

/**
 * Extended wizard phase that includes phase 0 (parent selection) and 5B (short title).
 * Used for cut and reel video types which have different phase flows.
 *
 * - Phase 0: Parent video selection (cut/reel only) - NUMBER type
 * - Phase 5B: Short title selection (cut only) - STRING type to differentiate from phase 5
 *
 * Note: Phase 0 is numeric for consistency with other phases.
 * Phase '5B' is a string because it's a sub-phase of 5 and needs to be distinguishable.
 */
export type ExtendedWizardPhase = 0 | WizardPhase | '5B'

/**
 * Video types that the wizard can handle.
 * Each type has a different phase flow.
 */
export type VideoTypeForWizard = 'episode' | 'cut' | 'reel'

/**
 * Status of each phase.
 * - pending: not started
 * - loading: processing
 * - completed: done
 * - error: failed
 * - needs_review: has data but needs user confirmation (phases 2, 3)
 */
export type PhaseStatus = 'pending' | 'loading' | 'completed' | 'error' | 'needs_review'

/**
 * Type of phase - determines if it can be reprocessed.
 */
export type PhaseType = 'immutable' | 'reprocessable' | 'final'

/**
 * State of a single phase.
 */
export interface PhaseState<T = unknown> {
  status: PhaseStatus
  data: T | null
  error: string | null
}

/**
 * Complete wizard state.
 */
export interface WizardState {
  videoId: string
  videoType: VideoTypeForWizard
  currentPhase: WizardPhase
  phases: Record<WizardPhase, PhaseState>
}

/**
 * Console message types for the console area.
 */
export type ConsoleMessageType = 'spinner' | 'alert'

/**
 * Alert severity levels.
 */
export type AlertSeverity = 'info' | 'success' | 'warning' | 'error'

/**
 * Console message for display in the console area.
 */
export interface ConsoleMessage {
  id: string
  phase: WizardPhase
  type: ConsoleMessageType
  timestamp: Date
  // For spinner
  spinnerText?: string
  // For alert
  alertTitle?: string
  alertText?: string
  alertSeverity?: AlertSeverity
  // For collapsible alerts (AC5)
  collapsed?: boolean
}

/**
 * Phase metadata for UI display.
 * Note: For extended phases (0 and 5B), the `phase` field uses the closest
 * WizardPhase for compatibility with existing code.
 */
export interface PhaseMetadata {
  phase: WizardPhase | 0 // Extended to support phase 0
  label: string
  type: PhaseType
  spinnerText: string
  alertTitle: string
}

/**
 * Mapping of phase number to the corresponding video field that holds the data.
 * Used for syncing localStorage state with Firestore data.
 */
export interface PhaseDataFields {
  1: 'critique'
  2: 'editingIssues'
  3: 'riskAndCompliance'
  4: 'chapters'
  5: 'title'
  6: 'description'
  7: 'tags'
  8: 'status' // Phase 8 checks if status === 'sent'
}

/**
 * Video data subset needed for syncing wizard state.
 * Contains only the fields that indicate phase completion.
 */
export interface VideoDataForSync {
  critique?: string
  editingIssues?: unknown[]
  riskAndCompliance?: unknown[]
  chapters?: unknown[]
  suggestedTitles?: string[] // Phase 5 uses LLM suggestions, not user-selected title
  suggestedShortTitles?: string[] // Phase 5B uses LLM suggestions for short titles (cut only)
  shortTitle?: string // Selected short title (cut only)
  description?: string
  tags?: string[]
  status?: string
  reviewedPhases?: number[]
  // For cut/reel videos
  videoType?: 'episode' | 'cut' | 'reel'
  parentEpisodeId?: string
}

/**
 * Actions for the wizard reducer.
 */
export type WizardAction =
  | { type: 'SET_PHASE'; phase: WizardPhase }
  | { type: 'SET_PHASE_STATUS'; phase: WizardPhase; status: PhaseStatus }
  | { type: 'SET_PHASE_DATA'; phase: WizardPhase; data: unknown }
  | { type: 'SET_PHASE_ERROR'; phase: WizardPhase; error: string }
  | { type: 'INVALIDATE_FROM_PHASE'; phase: WizardPhase }
  | { type: 'COMPLETE_PHASE_AND_ADVANCE'; phase: ExtendedWizardPhase; data: unknown }
  | { type: 'SYNC_WITH_VIDEO_DATA'; videoData: VideoDataForSync }
  | { type: 'HYDRATE_FROM_VIDEO_DATA'; videoData: VideoDataForSync }
  | { type: 'RESET' }
  | { type: 'RESET_TO_STATE'; state: WizardState }
