import { describe, expect, it } from 'vitest'

import {
  WIZARD_PHASE_IDS,
  TRACKED_PHASE_IDS,
  LLM_PHASE_IDS,
  isWizardPhaseId,
  isTrackedPhaseId,
  isLLMPhaseId,
  phaseIdOrder,
} from './phase-id-map'

describe('phase-id-map (TD-7 semantic phase IDs)', () => {
  describe('WIZARD_PHASE_IDS', () => {
    it('lists all 12 phases in canonical order (incl. links, Epic 26)', () => {
      expect(WIZARD_PHASE_IDS).toEqual([
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
        'links',
        'publish',
      ])
    })
  })

  describe('TRACKED_PHASE_IDS', () => {
    it('is the 8 phases with a state slot (excludes parent/short-title/thumbnail)', () => {
      expect(TRACKED_PHASE_IDS).toEqual([
        'critique',
        'edit-check',
        'risk',
        'chapters',
        'title',
        'description',
        'tags',
        'publish',
      ])
    })
  })

  describe('LLM_PHASE_IDS', () => {
    it('is the 7 generic-route LLM phases (excludes parent/short-title/thumbnail/publish)', () => {
      expect(LLM_PHASE_IDS).toEqual([
        'critique',
        'edit-check',
        'risk',
        'chapters',
        'title',
        'description',
        'tags',
      ])
    })
  })

  describe('isWizardPhaseId', () => {
    it('accepts every canonical id', () => {
      for (const id of WIZARD_PHASE_IDS) {
        expect(isWizardPhaseId(id)).toBe(true)
      }
    })

    it('rejects legacy numeric/string and unknowns', () => {
      expect(isWizardPhaseId('5')).toBe(false)
      expect(isWizardPhaseId('5B')).toBe(false)
      expect(isWizardPhaseId('THUMB')).toBe(false)
      expect(isWizardPhaseId('nope')).toBe(false)
    })
  })

  describe('isTrackedPhaseId', () => {
    it('accepts tracked phases, rejects extended ones', () => {
      expect(isTrackedPhaseId('critique')).toBe(true)
      expect(isTrackedPhaseId('publish')).toBe(true)
      expect(isTrackedPhaseId('parent')).toBe(false)
      expect(isTrackedPhaseId('short-title')).toBe(false)
      expect(isTrackedPhaseId('thumbnail')).toBe(false)
    })
  })

  describe('isLLMPhaseId', () => {
    it('accepts the 7 LLM phases, rejects the rest', () => {
      for (const id of LLM_PHASE_IDS) {
        expect(isLLMPhaseId(id)).toBe(true)
      }
      expect(isLLMPhaseId('publish')).toBe(false)
      expect(isLLMPhaseId('short-title')).toBe(false)
      expect(isLLMPhaseId('parent')).toBe(false)
    })
  })

  describe('phaseIdOrder', () => {
    it('returns the canonical 0-based index', () => {
      expect(phaseIdOrder('parent')).toBe(0)
      expect(phaseIdOrder('critique')).toBe(1)
      expect(phaseIdOrder('links')).toBe(10)
      expect(phaseIdOrder('publish')).toBe(11)
    })

    it('orders short-title between title and description', () => {
      expect(phaseIdOrder('short-title')).toBeGreaterThan(phaseIdOrder('title'))
      expect(phaseIdOrder('short-title')).toBeLessThan(phaseIdOrder('description'))
    })
  })
})
