/**
 * Semantic wizard phase IDs (TD-7 — Epic 25).
 *
 * The single source of truth for phase identity across the wizard: in-memory
 * state, the /api/wizard/phase routes, the wizard-job + reviewedPhases
 * persistence, and the LLM prompt config are all keyed by these kebab IDs.
 *
 * The legacy numeric dualidade (`WizardPhase = 1..8` + `ExtendedWizardPhase =
 * 0 | 1..8 | '5B' | 'THUMB'`) and its bidirectional mapper were removed in
 * Story 25.7e once every layer had been migrated. Legacy numeric records in
 * Firestore are converted by scripts/backfill-reviewed-phases-kebab.ts.
 *
 * @see epic-25-td7-full-migration-plan.md
 */

/**
 * The semantic phase IDs, in canonical wizard order.
 *
 * Historical numbering (for reference only): 0=parent, 1=critique, 2=edit-check,
 * 3=risk, 4=chapters, 5=title, 5B=short-title, 6=description, 7=tags,
 * THUMB=thumbnail, 8=publish. `links` (Epic 26) is a new extended phase for
 * episodes, between thumbnail and publish.
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
  | 'extra-images'
  | 'links'
  | 'publish'

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
  'extra-images',
  'links',
  'publish',
]

const WIZARD_PHASE_ID_SET: ReadonlySet<string> = new Set(WIZARD_PHASE_IDS)

/** Type guard: whether an arbitrary string is a valid semantic phase ID. */
export function isWizardPhaseId(value: string): value is WizardPhaseId {
  return WIZARD_PHASE_ID_SET.has(value)
}

/**
 * The "tracked" phase IDs — the ones with a slot in `WizardState.phases`
 * (the former numeric phases 1-8). The "extended" phases (`parent`,
 * `short-title`, `thumbnail`, `extra-images`, `links`) are NOT tracked in the
 * state record; their completion is derived from video data (parentEpisodeId /
 * shortTitle / storageThumbnailUrl / extraImages /
 * reviewedPhases.includes('links')).
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

/** Tracked phase IDs in canonical order. */
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
 * Phase IDs that have an LLM call via the generic /api/wizard/phase/[phase]
 * route (the former numeric phases 1-7). Excludes parent/publish (no LLM) and
 * short-title/thumbnail (dedicated routes).
 */
export type LLMPhaseId =
  | 'critique'
  | 'edit-check'
  | 'risk'
  | 'chapters'
  | 'title'
  | 'description'
  | 'tags'

/** LLM phase IDs in canonical order (the generic route handles these). */
export const LLM_PHASE_IDS: readonly LLMPhaseId[] = [
  'critique',
  'edit-check',
  'risk',
  'chapters',
  'title',
  'description',
  'tags',
]

const LLM_PHASE_SET: ReadonlySet<string> = new Set(LLM_PHASE_IDS)

/** Type guard: whether an arbitrary string is an LLM phase id (generic route). */
export function isLLMPhaseId(value: string): value is LLMPhaseId {
  return LLM_PHASE_SET.has(value)
}

/**
 * Canonical order index of a phase ID (0-based over WIZARD_PHASE_IDS).
 * Replaces numeric comparisons like `phase > x` / `phase <= 4`.
 */
export function phaseIdOrder(id: WizardPhaseId): number {
  return WIZARD_PHASE_IDS.indexOf(id)
}
