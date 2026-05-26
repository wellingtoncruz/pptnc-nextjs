// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { migrateReviewedPhases } from './backfill-reviewed-phases-kebab'

describe('migrateReviewedPhases (Story 25.7d)', () => {
  it('maps the legacy review-phase numbers to kebab ids', () => {
    expect(migrateReviewedPhases([2, 3])).toEqual({
      result: ['edit-check', 'risk'],
      changed: true,
    })
    expect(migrateReviewedPhases([2, 3, 4])).toEqual({
      result: ['edit-check', 'risk', 'chapters'],
      changed: true,
    })
  })

  it('maps the full legacy phase set defensively', () => {
    expect(migrateReviewedPhases([1, 5, 6, 7, 8]).result).toEqual([
      'critique',
      'title',
      'description',
      'tags',
      'publish',
    ])
  })

  it('is idempotent on already-migrated kebab arrays (no change)', () => {
    expect(migrateReviewedPhases(['edit-check', 'risk'])).toEqual({
      result: ['edit-check', 'risk'],
      changed: false,
    })
  })

  it('handles a mixed array (partial migration)', () => {
    const r = migrateReviewedPhases([2, 'risk'])
    expect(r.result).toEqual(['edit-check', 'risk'])
    expect(r.changed).toBe(true)
  })

  it('handles an empty array', () => {
    expect(migrateReviewedPhases([])).toEqual({ result: [], changed: false })
  })

  it('throws on an unknown legacy number', () => {
    expect(() => migrateReviewedPhases([99])).toThrow(/Unknown legacy reviewedPhases number/)
  })
})
