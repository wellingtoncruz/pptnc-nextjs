/**
 * Phase names for human-readable display in the wizard UI.
 *
 * Used for:
 * - Advance button labels: "Avançar para [Nome da Fase]"
 * - Breadcrumb tooltips
 * - Console messages
 */

import type { ExtendedWizardPhase, VideoTypeForWizard, WizardPhase } from './types'
import { EXTENDED_PHASE_METADATA } from './constants'
import { getNextPhaseForType } from './machine'

/**
 * Map of phase numbers to human-readable names in Portuguese.
 */
export const PHASE_NAMES: Record<WizardPhase, string> = {
  1: 'Crítica Inicial',
  2: 'Análise de Edição',
  3: 'Risco e Conformidade',
  4: 'Capítulos',
  5: 'Título',
  6: 'Descrição',
  7: 'Tags',
  8: 'Publicar no YouTube',
}

/**
 * Get the name of the next phase after the current one.
 *
 * @param currentPhase - The current phase number
 * @returns The name of the next phase, or null if at the last phase
 * @deprecated Use getNextPhaseNameForType for proper videoType-aware navigation.
 */
export function getNextPhaseName(currentPhase: WizardPhase): string | null {
  if (currentPhase >= 8) return null
  const nextPhase = (currentPhase + 1) as WizardPhase
  return PHASE_NAMES[nextPhase]
}

/**
 * Get the name of the next phase based on video type's phase flow.
 *
 * For example:
 * - episode: 5 → 6 (Descrição)
 * - cut: 5 → 5B (Título Curto)
 * - reel: 5 → 6 (Descrição)
 *
 * When `features.thumbnailGeneration` is on (Epic 22), advancing from Tags
 * for episode/cut returns "Thumbnail" instead of "Publicar no YouTube" —
 * keeps the advance button label honest about where the user is going.
 *
 * @param currentPhase - The current phase
 * @param videoType - The video type (episode, cut, reel)
 * @param features - Optional podcast feature flags. When omitted, behaves
 *                   identically to before Epic 22 (no Thumbnail phase).
 * @returns The name of the next phase, or null if at the last phase
 */
export function getNextPhaseNameForType(
  currentPhase: ExtendedWizardPhase,
  videoType: VideoTypeForWizard = 'episode',
  features?: { thumbnailGeneration?: boolean }
): string | null {
  const nextPhase = getNextPhaseForType(currentPhase, videoType, features)
  if (nextPhase === null) return null
  return EXTENDED_PHASE_METADATA[nextPhase]?.label ?? null
}
