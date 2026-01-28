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
 * Status of each phase.
 */
export type PhaseStatus = 'pending' | 'loading' | 'completed' | 'error'

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
}

/**
 * Phase metadata for UI display.
 */
export interface PhaseMetadata {
  phase: WizardPhase
  label: string
  type: PhaseType
  spinnerText: string
  alertTitle: string
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
  | { type: 'RESET' }
