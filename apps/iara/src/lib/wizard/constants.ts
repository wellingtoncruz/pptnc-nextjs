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
  'extra-images': {
    phase: 'extra-images',
    label: 'Imagens Extras',
    type: 'reprocessable',
    spinnerText: 'Gerando imagens extras...',
    alertTitle: 'Imagens Extras',
  },
  links: {
    phase: 'links',
    label: 'Links',
    type: 'reprocessable',
    spinnerText: 'Carregando links...',
    alertTitle: 'Links do Episódio',
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
  // Epic 26: 'links' is an episode-only phase, right before publish (after
  // thumbnail when the feature is on — see getPhaseIdsForVideoTypeWithFeatures).
  episode: ['critique', 'edit-check', 'risk', 'chapters', 'title', 'description', 'tags', 'links', 'publish'],
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
 * Phase IDs that exist only for podcast videos. A standalone video (Epic 25
 * Bloco B — editorial flag) drops these: parent selection (Phase 0) + the
 * analysis phases (critique/edit-check/risk/chapters). The format phases
 * (short-title/thumbnail) are NOT here — they stay driven by duration, the
 * flag does not change them. See ADR-25.3 / §7 of the epic doc.
 */
const PODCAST_ONLY_PHASE_IDS: ReadonlySet<WizardPhaseId> = new Set<WizardPhaseId>([
  'parent',
  'critique',
  'edit-check',
  'risk',
  'chapters',
])

/**
 * Returns the wizard phase IDs for a given video type, applying:
 * - `standalone` (Epic 25): when true, drops the podcast-only phases
 *   ({@link PODCAST_ONLY_PHASE_IDS}) — parent selection + analysis phases —
 *   preserving the duration-driven format phases. For cut/reel this removes
 *   only `parent` (they have no analysis phases).
 * - `features.thumbnailGeneration` (Epic 22): inserts the Thumbnail phase
 *   between Tags and Publish. Reels never get it (scope: only episode/cut).
 *   The Thumbnail decision is by duration, independent of `standalone`.
 * - `features.extraImagesGeneration` (Epic 28): inserts the Imagens Extras
 *   phase right after Thumbnail. **Episode-only** and independent of
 *   `thumbnailGeneration` — with Thumbnail off, it anchors before `links`
 *   just the same.
 *
 * Applied in order: standalone filter first, then thumbnail, then extra images
 * — so a standalone cut with the thumbnail feature on still gets a Thumbnail
 * phase, and the two image phases keep the wizard order (thumbnail → extras).
 */
export function getPhaseIdsForVideoTypeWithFeatures(
  videoType: VideoTypeForWizard,
  features?: { thumbnailGeneration?: boolean; extraImagesGeneration?: boolean },
  standalone = false
): WizardPhaseId[] {
  let base = getPhaseIdsForVideoType(videoType)
  if (standalone) {
    base = base.filter((id) => !PODCAST_ONLY_PHASE_IDS.has(id))
  }

  /**
   * Insere `phase` antes das fases de fechamento: `links` quando existe
   * (Epic 26, episódios), senão `publish`. Devolve a lista intacta se nenhuma
   * das duas âncoras existir.
   */
  function insertBeforeClosing(list: WizardPhaseId[], phase: WizardPhaseId): WizardPhaseId[] {
    const linksIndex = list.indexOf('links')
    const anchorIndex = linksIndex >= 0 ? linksIndex : list.indexOf('publish')
    if (anchorIndex < 0) return list
    return [...list.slice(0, anchorIndex), phase, ...list.slice(anchorIndex)]
  }

  // Thumbnail: episode + cut (reels nunca), Epic 22.
  if (features?.thumbnailGeneration && videoType !== 'reel') {
    base = insertBeforeClosing(base, 'thumbnail')
  }
  // Imagens Extras: só episode, Epic 28. Como entra depois, cai naturalmente
  // à direita de 'thumbnail' quando as duas features estão ligadas.
  if (features?.extraImagesGeneration && videoType === 'episode') {
    base = insertBeforeClosing(base, 'extra-images')
  }
  return base
}

// Re-export the canonical phase-ID list for convenience.
export { WIZARD_PHASE_IDS, TRACKED_PHASE_IDS }
