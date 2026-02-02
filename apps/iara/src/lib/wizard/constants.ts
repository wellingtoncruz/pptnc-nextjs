/**
 * Constants and metadata for the wizard phases.
 */

import type { ExtendedWizardPhase, PhaseMetadata, VideoTypeForWizard, WizardPhase } from './types'

/**
 * All wizard phases in order.
 */
export const WIZARD_PHASES: WizardPhase[] = [1, 2, 3, 4, 5, 6, 7, 8]

/**
 * Metadata for each phase of the wizard.
 *
 * - immutable: Cannot be reprocessed (phases 1-4)
 * - reprocessable: Can be reprocessed with prompt override (phases 5-7)
 * - final: No LLM processing, just API call (phase 8)
 */
export const PHASE_METADATA: Record<WizardPhase, PhaseMetadata> = {
  1: {
    phase: 1,
    label: 'Crítica',
    type: 'immutable',
    spinnerText: 'Estou assistindo o episódio para te dar uma opinião sincera...',
    alertTitle: 'Crítica do Especialista',
  },
  2: {
    phase: 2,
    label: 'Edição',
    type: 'immutable',
    spinnerText: 'Verificando se existem falhas de edição perceptíveis...',
    alertTitle: 'Checagem de Edição',
  },
  3: {
    phase: 3,
    label: 'Compliance',
    type: 'immutable',
    spinnerText: 'Verificando se existem pontos polêmicos ou riscos de conformidade...',
    alertTitle: 'Riscos e Conformidade',
  },
  4: {
    phase: 4,
    label: 'Capítulos',
    type: 'immutable',
    spinnerText: 'Fazendo a separação de capítulos...',
    alertTitle: 'Capítulos',
  },
  5: {
    phase: 5,
    label: 'Título',
    type: 'reprocessable',
    spinnerText: 'Pensando em boas sugestões de título...',
    alertTitle: 'Títulos',
  },
  6: {
    phase: 6,
    label: 'Descrição',
    type: 'reprocessable',
    spinnerText: 'Calculando uma descrição otimizada para você...',
    alertTitle: 'Descrição',
  },
  7: {
    phase: 7,
    label: 'Tags',
    type: 'reprocessable',
    spinnerText: 'Calculando as tags...',
    alertTitle: 'Tags',
  },
  8: {
    phase: 8,
    label: 'Publicar',
    type: 'final',
    spinnerText: 'Enviando para o YouTube...',
    alertTitle: 'Publicação',
  },
}

/**
 * Get phases that are reprocessable.
 */
export const REPROCESSABLE_PHASES: WizardPhase[] = WIZARD_PHASES.filter(
  (phase) => PHASE_METADATA[phase].type === 'reprocessable'
)

/**
 * Get phases that are immutable.
 */
export const IMMUTABLE_PHASES: WizardPhase[] = WIZARD_PHASES.filter(
  (phase) => PHASE_METADATA[phase].type === 'immutable'
)

/**
 * Check if a phase is reprocessable.
 */
export function isReprocessablePhase(phase: WizardPhase): boolean {
  return PHASE_METADATA[phase].type === 'reprocessable'
}

/**
 * Get phases that would be invalidated if reprocessing from a given phase.
 * Only phases AFTER the given phase are invalidated.
 */
export function getPhasesToInvalidate(fromPhase: WizardPhase): WizardPhase[] {
  return WIZARD_PHASES.filter((phase) => phase > fromPhase)
}

// ============================================================================
// CUT/REEL SUPPORT - Phase mapping by video type
// ============================================================================

/**
 * Phases available for each video type.
 *
 * - episode: Full flow (phases 1-8)
 * - cut: Parent selection → Title → Short Title → Description → Tags → Publish
 * - reel: Parent selection → Title → Description → Tags → Publish
 *
 * Phase 0: Parent video selection (cut/reel only)
 * Phase 5B: Short title for thumbnails (cut only)
 */
export const PHASES_BY_VIDEO_TYPE: Record<VideoTypeForWizard, ExtendedWizardPhase[]> = {
  episode: [1, 2, 3, 4, 5, 6, 7, 8],
  cut: [0, 5, '5B', 6, 7, 8],
  reel: [0, 5, 6, 7, 8],
}

/**
 * Returns the valid phases for a given video type.
 * Defaults to episode phases if video type is unknown.
 */
export function getPhasesForVideoType(videoType: VideoTypeForWizard): ExtendedWizardPhase[] {
  return PHASES_BY_VIDEO_TYPE[videoType] ?? PHASES_BY_VIDEO_TYPE.episode
}

/**
 * Checks if a phase is valid for a given video type.
 */
export function isPhaseValidForVideoType(
  phase: ExtendedWizardPhase,
  videoType: VideoTypeForWizard
): boolean {
  const validPhases = PHASES_BY_VIDEO_TYPE[videoType]
  if (!validPhases) return false
  return validPhases.includes(phase)
}

/**
 * Extended phase metadata including phase 0 and 5B.
 * Used for cut and reel video types.
 *
 * Note: Phase 0 is numeric (consistent with other phases).
 * Phase '5B' is a string to differentiate from phase 5 (full title).
 */
export const EXTENDED_PHASE_METADATA: Record<ExtendedWizardPhase, PhaseMetadata> = {
  ...PHASE_METADATA,
  0: {
    phase: 0, // Phase 0 for parent selection (cut/reel only)
    label: 'Vídeo Pai',
    type: 'immutable',
    spinnerText: 'Carregando episódios disponíveis...',
    alertTitle: 'Seleção de Vídeo Pai',
  },
  '5B': {
    phase: 5, // Uses phase 5 as base for compatibility with existing code
    label: 'Título Curto',
    type: 'reprocessable',
    spinnerText: 'Gerando sugestões de título curto para thumbnail...',
    alertTitle: 'Títulos Curtos',
  },
}
