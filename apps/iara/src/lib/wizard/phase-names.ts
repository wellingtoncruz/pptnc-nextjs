/**
 * Phase names for human-readable display in the wizard UI.
 *
 * Used for:
 * - Advance button labels: "Avançar para [Nome da Fase]"
 * - Breadcrumb tooltips
 * - Console messages
 */

import { PHASE_ID_METADATA } from './constants'
import { getNextPhase, getNextPhaseForType } from './machine'
import type { WizardPhaseId } from './phase-id-map'
import type { VideoTypeForWizard } from './types'

/**
 * Map of phase IDs to human-readable names in Portuguese.
 */
export const PHASE_NAMES: Record<WizardPhaseId, string> = {
  parent: 'Vídeo Pai',
  critique: 'Crítica Inicial',
  'edit-check': 'Análise de Edição',
  risk: 'Risco e Conformidade',
  chapters: 'Capítulos',
  title: 'Título',
  'short-title': 'Título Curto',
  description: 'Descrição',
  tags: 'Tags',
  thumbnail: 'Thumbnail',
  links: 'Links',
  publish: 'Publicar no YouTube',
}

/**
 * Get the name of the next phase after the current one.
 *
 * @param currentPhase - The current phase ID
 * @returns The name of the next phase, or null if at the last phase
 * @deprecated Use getNextPhaseNameForType for proper videoType-aware navigation.
 */
export function getNextPhaseName(currentPhase: WizardPhaseId): string | null {
  const nextPhase = getNextPhase(currentPhase)
  if (nextPhase === null) return null
  return PHASE_NAMES[nextPhase]
}

/**
 * Get the name of the next phase based on video type's phase flow.
 *
 * For example:
 * - episode: title → Descrição
 * - cut: title → Título Curto (short-title)
 * - reel: title → Descrição
 *
 * When `features.thumbnailGeneration` is on (Epic 22), advancing from tags
 * for episode/cut returns "Thumbnail" instead of "Publicação".
 *
 * @returns The name of the next phase, or null if at the last phase
 */
export function getNextPhaseNameForType(
  currentPhase: WizardPhaseId,
  videoType: VideoTypeForWizard = 'episode',
  features?: { thumbnailGeneration?: boolean }
): string | null {
  const nextPhase = getNextPhaseForType(currentPhase, videoType, features)
  if (nextPhase === null) return null
  return PHASE_ID_METADATA[nextPhase]?.label ?? null
}
