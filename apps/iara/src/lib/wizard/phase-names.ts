/**
 * Phase names for human-readable display in the wizard UI.
 *
 * Used for:
 * - Advance button labels: "Avançar para [Nome da Fase]"
 * - Breadcrumb tooltips
 * - Console messages
 */

import type { WizardPhase } from './types'

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
 */
export function getNextPhaseName(currentPhase: WizardPhase): string | null {
  if (currentPhase >= 8) return null
  const nextPhase = (currentPhase + 1) as WizardPhase
  return PHASE_NAMES[nextPhase]
}
