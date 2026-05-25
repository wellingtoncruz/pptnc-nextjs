/**
 * Semantic wizard phase IDs (TD-7 — Epic 25).
 *
 * Replaces the numeric/string dualidade (`WizardPhase = 1..8` + `ExtendedWizardPhase
 * = 0 | 1..8 | '5B' | 'THUMB'`) with a single set of kebab-case semantic IDs.
 *
 * This module is ADDITIVE: it introduces the new vocabulary and a bidirectional
 * mapper to/from the legacy numeric phases, without changing the existing types.
 * Later stories (25.2-25.5) migrate each layer to the semantic IDs using this
 * mapper as a bridge; Story 25.6 migrates persisted Firestore docs; Story 25.7
 * removes the legacy numeric type once nothing references it.
 *
 * @see Story 25.1 - Tipos + mapper bidirecional
 */

import type { ExtendedWizardPhase } from './types'

/**
 * The semantic phase IDs, in canonical wizard order.
 *
 * Mapping from legacy:
 * `0→parent, 1→critique, 2→edit-check, 3→risk, 4→chapters, 5→title,
 *  5B→short-title, 6→description, 7→tags, THUMB→thumbnail, 8→publish`
 */
export type WizardPhaseId =
  | 'parent'
  | 'critique'
  | 'edit-check'
  | 'risk'
  | 'chapters'
  | 'title'
  | 'short-title'
  | 'description'
  | 'tags'
  | 'thumbnail'
  | 'publish'

/**
 * Legacy phase (numeric/string) → semantic ID.
 * `Record<ExtendedWizardPhase, WizardPhaseId>` enforces exhaustiveness: adding a
 * legacy phase without mapping it is a compile error.
 */
const LEGACY_TO_ID: Record<ExtendedWizardPhase, WizardPhaseId> = {
  0: 'parent',
  1: 'critique',
  2: 'edit-check',
  3: 'risk',
  4: 'chapters',
  5: 'title',
  '5B': 'short-title',
  6: 'description',
  7: 'tags',
  THUMB: 'thumbnail',
  8: 'publish',
}

/**
 * Semantic ID → legacy phase (numeric/string).
 * `Record<WizardPhaseId, ExtendedWizardPhase>` enforces exhaustiveness in reverse.
 */
const ID_TO_LEGACY: Record<WizardPhaseId, ExtendedWizardPhase> = {
  parent: 0,
  critique: 1,
  'edit-check': 2,
  risk: 3,
  chapters: 4,
  title: 5,
  'short-title': '5B',
  description: 6,
  tags: 7,
  thumbnail: 'THUMB',
  publish: 8,
}

/** All semantic phase IDs in canonical order (parent → publish). */
export const WIZARD_PHASE_IDS: readonly WizardPhaseId[] = [
  'parent',
  'critique',
  'edit-check',
  'risk',
  'chapters',
  'title',
  'short-title',
  'description',
  'tags',
  'thumbnail',
  'publish',
]

/**
 * The "tracked" phase IDs — the ones with a slot in `WizardState.phases`
 * (the former numeric phases 1-8). The "extended" phases (`parent`,
 * `short-title`, `thumbnail`) are NOT tracked in the state record; their
 * completion is derived from video data (parentEpisodeId / shortTitle /
 * storageThumbnailUrl).
 */
export type TrackedPhaseId =
  | 'critique'
  | 'edit-check'
  | 'risk'
  | 'chapters'
  | 'title'
  | 'description'
  | 'tags'
  | 'publish'

/** Tracked phase IDs in canonical order (replaces the numeric WIZARD_PHASES). */
export const TRACKED_PHASE_IDS: readonly TrackedPhaseId[] = [
  'critique',
  'edit-check',
  'risk',
  'chapters',
  'title',
  'description',
  'tags',
  'publish',
]

const TRACKED_SET: ReadonlySet<string> = new Set(TRACKED_PHASE_IDS)

/** Type guard: whether a phase ID has a slot in WizardState.phases. */
export function isTrackedPhaseId(id: WizardPhaseId): id is TrackedPhaseId {
  return TRACKED_SET.has(id)
}

/**
 * Canonical order index of a phase ID (0-based over WIZARD_PHASE_IDS).
 * Replaces numeric comparisons like `phase > x` / `phase <= 4`.
 */
export function phaseIdOrder(id: WizardPhaseId): number {
  return WIZARD_PHASE_IDS.indexOf(id)
}

/** Maps a legacy numeric/string phase to its semantic ID. */
export function toPhaseId(legacy: ExtendedWizardPhase): WizardPhaseId {
  return LEGACY_TO_ID[legacy]
}

/** Maps a semantic ID back to its legacy numeric/string phase. */
export function toLegacyPhase(id: WizardPhaseId): ExtendedWizardPhase {
  return ID_TO_LEGACY[id]
}

/** Type guard: whether an arbitrary string is a valid semantic phase ID. */
export function isWizardPhaseId(value: string): value is WizardPhaseId {
  return Object.prototype.hasOwnProperty.call(ID_TO_LEGACY, value)
}
