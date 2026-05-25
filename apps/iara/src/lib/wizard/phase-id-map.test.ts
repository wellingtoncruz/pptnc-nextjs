import { describe, it, expect } from 'vitest'

import type { ExtendedWizardPhase } from './types'
import {
  WIZARD_PHASE_IDS,
  toPhaseId,
  toLegacyPhase,
  isWizardPhaseId,
  type WizardPhaseId,
} from './phase-id-map'

const ALL_LEGACY_PHASES: ExtendedWizardPhase[] = [0, 1, 2, 3, 4, 5, '5B', 6, 7, 'THUMB', 8]

describe('phase-id-map', () => {
  describe('explicit mapping legacy → id', () => {
    const cases: Array<[ExtendedWizardPhase, WizardPhaseId]> = [
      [0, 'parent'],
      [1, 'critique'],
      [2, 'edit-check'],
      [3, 'risk'],
      [4, 'chapters'],
      [5, 'title'],
      ['5B', 'short-title'],
      [6, 'description'],
      [7, 'tags'],
      ['THUMB', 'thumbnail'],
      [8, 'publish'],
    ]

    it.each(cases)('maps legacy %s → "%s"', (legacy, id) => {
      expect(toPhaseId(legacy)).toBe(id)
    })
  })

  describe('round-trip', () => {
    it('legacy → id → legacy preserves every legacy phase', () => {
      for (const legacy of ALL_LEGACY_PHASES) {
        expect(toLegacyPhase(toPhaseId(legacy))).toBe(legacy)
      }
    })

    it('id → legacy → id preserves every semantic id', () => {
      for (const id of WIZARD_PHASE_IDS) {
        expect(toPhaseId(toLegacyPhase(id))).toBe(id)
      }
    })
  })

  describe('completeness', () => {
    it('covers all 11 legacy phases', () => {
      expect(ALL_LEGACY_PHASES).toHaveLength(11)
      expect(WIZARD_PHASE_IDS).toHaveLength(11)
    })

    it('every legacy phase maps to a distinct id', () => {
      const ids = ALL_LEGACY_PHASES.map(toPhaseId)
      expect(new Set(ids).size).toBe(ALL_LEGACY_PHASES.length)
    })

    it('WIZARD_PHASE_IDS is in canonical order (parent first, publish last)', () => {
      expect(WIZARD_PHASE_IDS[0]).toBe('parent')
      expect(WIZARD_PHASE_IDS[WIZARD_PHASE_IDS.length - 1]).toBe('publish')
    })
  })

  describe('isWizardPhaseId', () => {
    it('returns true for valid ids', () => {
      expect(isWizardPhaseId('title')).toBe(true)
      expect(isWizardPhaseId('short-title')).toBe(true)
      expect(isWizardPhaseId('thumbnail')).toBe(true)
    })

    it('returns false for invalid ids', () => {
      expect(isWizardPhaseId('')).toBe(false)
      expect(isWizardPhaseId('5B')).toBe(false)
      expect(isWizardPhaseId('8')).toBe(false)
      expect(isWizardPhaseId('Title')).toBe(false)
    })
  })
})
