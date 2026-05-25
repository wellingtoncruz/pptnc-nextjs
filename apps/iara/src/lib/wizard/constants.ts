/**
 * Constants and metadata for the wizard phases.
 *
 * TD-7 (Epic 25): kebab-native. Phases are identified by semantic
 * {@link WizardPhaseId}; the former numeric tables were removed.
 */

import {
  TRACKED_PHASE_IDS,
  WIZARD_PHASE_IDS,
  phaseIdOrder,
  type TrackedPhaseId,
  type WizardPhaseId,
} from './phase-id-map'
import type { PhaseMetadata, VideoTypeForWizard } from './types'

/**
 * Metadata for each phase of the wizard, keyed by semantic phase ID.
 *
 * - immutable: Cannot be reprocessed (critique, edit-check, risk, chapters, parent)
 * - reprocessable: Can be reprocessed (title, short-title, description, tags, thumbnail)
 * - final: No LLM processing, just API call (publish)
 */
export const PHASE_ID_METADATA: Record<WizardPhaseId, PhaseMetadata> = {
  parent: {
    phase: 'parent',
    label: 'Vídeo Pai',
    type: 'immutable',
    spinnerText: 'Carregando episódios disponíveis...',
    alertTitle: 'Seleção de Vídeo Pai',
  },
  critique: {
    phase: 'critique',
    label: 'Crítica',
    type: 'immutable',
    spinnerText: 'Estou assistindo o episódio para te dar uma opinião sincera...',
    alertTitle: 'Crítica do Especialista',
  },
  'edit-check': {
    phase: 'edit-check',
    label: 'Edição',
    type: 'immutable',
    spinnerText: 'Verificando se existem falhas de edição perceptíveis...',
    alertTitle: 'Checagem de Edição',
  },
  risk: {
    phase: 'risk',
    label: 'Compliance',
    type: 'immutable',
    spinnerText: 'Verificando se existem pontos polêmicos ou riscos de conformidade...',
    alertTitle: 'Riscos e Conformidade',
  },
  chapters: {
    phase: 'chapters',
    label: 'Capítulos',
    type: 'immutable',
    spinnerText: 'Fazendo a separação de capítulos...',
    alertTitle: 'Capítulos',
  },
  title: {
    phase: 'title',
    label: 'Título',
    type: 'reprocessable',
    spinnerText: 'Pensando em boas sugestões de título...',
    alertTitle: 'Títulos',
  },
  'short-title': {
    phase: 'short-title',
    label: 'Título Curto',
    type: 'reprocessable',
    spinnerText: 'Gerando sugestões de título curto para thumbnail...',
    alertTitle: 'Títulos Curtos',
  },
  description: {
    phase: 'description',
    label: 'Descrição',
    type: 'reprocessable',
    spinnerText: 'Calculando uma descrição otimizada para você...',
    alertTitle: 'Descrição',
  },
  tags: {
    phase: 'tags',
    label: 'Tags',
    type: 'reprocessable',
    spinnerText: 'Calculando as tags...',
    alertTitle: 'Tags',
  },
  thumbnail: {
    phase: 'thumbnail',
    label: 'Thumbnail',
    type: 'reprocessable',
    spinnerText: 'Gerando thumbnail...',
    alertTitle: 'Thumbnail',
  },
  publish: {
    phase: 'publish',
    label: 'Publicar',
    type: 'final',
    spinnerText: 'Enviando para o YouTube...',
    alertTitle: 'Publicação',
  },
}

/** Tracked phase IDs that are reprocessable. */
export const REPROCESSABLE_PHASE_IDS: TrackedPhaseId[] = TRACKED_PHASE_IDS.filter(
  (id) => PHASE_ID_METADATA[id].type === 'reprocessable'
)

/** Tracked phase IDs that are immutable. */
export const IMMUTABLE_PHASE_IDS: TrackedPhaseId[] = TRACKED_PHASE_IDS.filter(
  (id) => PHASE_ID_METADATA[id].type === 'immutable'
)

/** Check if a phase is reprocessable. */
export function isReprocessablePhaseId(id: WizardPhaseId): boolean {
  return PHASE_ID_METADATA[id].type === 'reprocessable'
}

/**
 * Get tracked phases that would be invalidated if reprocessing from a given phase.
 * Only phases AFTER the given phase (canonical order) are invalidated.
 */
export function getPhaseIdsToInvalidate(fromPhase: WizardPhaseId): TrackedPhaseId[] {
  const fromOrder = phaseIdOrder(fromPhase)
  return TRACKED_PHASE_IDS.filter((id) => phaseIdOrder(id) > fromOrder)
}

// ============================================================================
// CUT/REEL SUPPORT - Phase mapping by video type
// ============================================================================

/**
 * Phases available for each video type.
 *
 * - episode: Full flow (critique → publish)
 * - cut: Parent selection → Title → Short Title → Description → Tags → Publish
 * - reel: Parent selection → Title → Description → Tags → Publish
 */
export const PHASE_IDS_BY_VIDEO_TYPE: Record<VideoTypeForWizard, WizardPhaseId[]> = {
  episode: ['critique', 'edit-check', 'risk', 'chapters', 'title', 'description', 'tags', 'publish'],
  cut: ['parent', 'title', 'short-title', 'description', 'tags', 'publish'],
  reel: ['parent', 'title', 'description', 'tags', 'publish'],
}

/**
 * Returns the valid phase IDs for a given video type.
 * Defaults to episode phases if video type is unknown.
 */
export function getPhaseIdsForVideoType(videoType: VideoTypeForWizard): WizardPhaseId[] {
  return PHASE_IDS_BY_VIDEO_TYPE[videoType] ?? PHASE_IDS_BY_VIDEO_TYPE.episode
}

/**
 * Checks if a phase ID is valid for a given video type.
 */
export function isPhaseIdValidForVideoType(
  phaseId: WizardPhaseId,
  videoType: VideoTypeForWizard
): boolean {
  const validPhases = PHASE_IDS_BY_VIDEO_TYPE[videoType]
  if (!validPhases) return false
  return validPhases.includes(phaseId)
}

/**
 * Returns the wizard phase IDs for a given video type, optionally inserting the
 * Thumbnail phase (Epic 22) between Tags and Publish when the podcast has
 * `features.thumbnailGeneration` enabled.
 *
 * Reels never get the Thumbnail phase (scope decision: only episode and cut).
 */
export function getPhaseIdsForVideoTypeWithFeatures(
  videoType: VideoTypeForWizard,
  features?: { thumbnailGeneration?: boolean }
): WizardPhaseId[] {
  const base = getPhaseIdsForVideoType(videoType)
  if (!features?.thumbnailGeneration) return base
  if (videoType === 'reel') return base
  // Insert 'thumbnail' immediately before 'publish'.
  const publishIndex = base.indexOf('publish')
  if (publishIndex < 0) return base
  return [...base.slice(0, publishIndex), 'thumbnail', ...base.slice(publishIndex)]
}

// Re-export the canonical phase-ID list for convenience.
export { WIZARD_PHASE_IDS, TRACKED_PHASE_IDS }
