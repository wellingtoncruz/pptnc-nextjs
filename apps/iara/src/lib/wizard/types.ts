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

import type { TrackedPhaseId, WizardPhaseId } from './phase-id-map'

/**
 * Zod schema for validating wizard phase numbers.
 * Phases 1-7 have LLM calls, phase 8 is YouTube API only.
 *
 * LEGACY (TD-7): numeric phases survive only at the serialization boundaries
 * (LLM prompt config keyed by phase number, the /api/wizard/phase/[phase] URL
 * param, Firestore reviewedPhases, wizard-job schema). The wizard state/logic
 * now uses semantic `WizardPhaseId` (see phase-id-map.ts); the mapper bridges
 * to/from these legacy numbers at the boundaries.
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
 * The 8 numeric phases — LEGACY, kept only for the serialization boundaries
 * above. In-memory wizard state uses {@link WizardPhaseId} instead.
 */
export type WizardPhase = z.infer<typeof WizardPhaseSchema>

/**
 * Extended numeric/string phase — LEGACY. Kept only as the domain of the
 * bidirectional mapper (phase-id-map.ts). Do not use in new wizard state/logic;
 * use {@link WizardPhaseId} / {@link TrackedPhaseId}.
 */
export type ExtendedWizardPhase = 0 | WizardPhase | '5B' | 'THUMB'

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
  /** Current phase — any semantic phase ID (incl. extended: parent/short-title/thumbnail). */
  currentPhase: WizardPhaseId
  /** Per-phase state for the tracked phases (the former numeric 1-8). */
  phases: Record<TrackedPhaseId, PhaseState>
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
  phase: WizardPhaseId
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
  phase: WizardPhaseId
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
  critique: 'critique'
  'edit-check': 'editingIssues'
  risk: 'riskAndCompliance'
  chapters: 'chapters'
  title: 'title'
  description: 'description'
  tags: 'tags'
  publish: 'status' // Publish phase checks if status === 'sent'
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
  suggestedTitles?: string[] // Phase 5 LLM-generated suggestions (not YouTube provisional title)
  suggestedShortTitles?: string[] // Phase 5B uses LLM suggestions for short titles (cut only)
  shortTitle?: string // Selected short title (cut only)
  description?: string
  tags?: string[]
  status?: string
  reviewedPhases?: string[]
  // For cut/reel videos
  videoType?: 'episode' | 'cut' | 'reel'
  parentEpisodeId?: string
}

/**
 * Actions for the wizard reducer.
 */
export type WizardAction =
  | { type: 'SET_PHASE'; phase: TrackedPhaseId }
  | { type: 'SET_PHASE_STATUS'; phase: TrackedPhaseId; status: PhaseStatus }
  | { type: 'SET_PHASE_DATA'; phase: TrackedPhaseId; data: unknown }
  | { type: 'SET_PHASE_ERROR'; phase: TrackedPhaseId; error: string }
  | { type: 'INVALIDATE_FROM_PHASE'; phase: TrackedPhaseId }
  | {
      type: 'COMPLETE_PHASE_AND_ADVANCE'
      phase: WizardPhaseId
      data: unknown
      /**
       * Optional podcast features (Epic 22). When `thumbnailGeneration` is on,
       * advancing from Tags (7) goes to 'THUMB' instead of Publicar (8). Without
       * this, the state machine falls back to the legacy sequence and SKIPS the
       * Thumbnail phase silently — bug fixed in Story 22.3b follow-up.
       */
      features?: { thumbnailGeneration?: boolean }
    }
  | { type: 'SYNC_WITH_VIDEO_DATA'; videoData: VideoDataForSync }
  | { type: 'HYDRATE_FROM_VIDEO_DATA'; videoData: VideoDataForSync; isRehydration?: boolean }
  | { type: 'RESET' }
  | { type: 'RESET_TO_STATE'; state: WizardState }
