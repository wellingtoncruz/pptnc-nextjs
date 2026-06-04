/**
 * Tests for wizard constants, including cut/reel phase mappings.
 *
 * TD-7 (Epic 25): the wizard is kebab-native. The former numeric tables
 * (PHASES_BY_VIDEO_TYPE / PHASE_METADATA / EXTENDED_PHASE_METADATA and the
 * `getPhasesForVideoType*` / `isPhaseValidForVideoType` helpers) were removed.
 * These tests cover the semantic phase-ID surface that replaced them.
 */

import { describe, expect, it } from 'vitest'

import {
  getPhaseIdsForVideoType,
  getPhaseIdsForVideoTypeWithFeatures,
  getPhaseIdsToInvalidate,
  IMMUTABLE_PHASE_IDS,
  isPhaseIdValidForVideoType,
  isReprocessablePhaseId,
  PHASE_ID_METADATA,
  PHASE_IDS_BY_VIDEO_TYPE,
  REPROCESSABLE_PHASE_IDS,
} from './constants'
import type { VideoTypeForWizard } from './types'

describe('PHASE_IDS_BY_VIDEO_TYPE', () => {
  it('episode has the full immutable→publish flow (incl. links, Epic 26)', () => {
    expect(PHASE_IDS_BY_VIDEO_TYPE.episode).toEqual([
      'critique',
      'edit-check',
      'risk',
      'chapters',
      'title',
      'description',
      'tags',
      'links',
      'publish',
    ])
  })

  it('cut has parent → title → short-title → description → tags → publish', () => {
    expect(PHASE_IDS_BY_VIDEO_TYPE.cut).toEqual([
      'parent',
      'title',
      'short-title',
      'description',
      'tags',
      'publish',
    ])
  })

  it('reel has parent → title → description → tags → publish', () => {
    expect(PHASE_IDS_BY_VIDEO_TYPE.reel).toEqual([
      'parent',
      'title',
      'description',
      'tags',
      'publish',
    ])
  })
})

describe('getPhaseIdsForVideoType', () => {
  it('returns correct phases for episode', () => {
    expect(getPhaseIdsForVideoType('episode')).toEqual([
      'critique',
      'edit-check',
      'risk',
      'chapters',
      'title',
      'description',
      'tags',
      'links',
      'publish',
    ])
  })

  it('returns correct phases for cut', () => {
    expect(getPhaseIdsForVideoType('cut')).toEqual([
      'parent',
      'title',
      'short-title',
      'description',
      'tags',
      'publish',
    ])
  })

  it('returns correct phases for reel', () => {
    expect(getPhaseIdsForVideoType('reel')).toEqual([
      'parent',
      'title',
      'description',
      'tags',
      'publish',
    ])
  })

  it('defaults to episode for unknown type', () => {
    expect(getPhaseIdsForVideoType('unknown' as VideoTypeForWizard)).toEqual([
      'critique',
      'edit-check',
      'risk',
      'chapters',
      'title',
      'description',
      'tags',
      'links',
      'publish',
    ])
  })
})

describe('isPhaseIdValidForVideoType', () => {
  describe('parent (parent selection)', () => {
    it('is NOT valid for episode', () => {
      expect(isPhaseIdValidForVideoType('parent', 'episode')).toBe(false)
    })

    it('is valid for cut', () => {
      expect(isPhaseIdValidForVideoType('parent', 'cut')).toBe(true)
    })

    it('is valid for reel', () => {
      expect(isPhaseIdValidForVideoType('parent', 'reel')).toBe(true)
    })
  })

  describe('critique/edit-check/risk/chapters (episode-only phases)', () => {
    const episodeOnlyPhases = ['critique', 'edit-check', 'risk', 'chapters'] as const

    episodeOnlyPhases.forEach((phase) => {
      it(`${phase} is valid for episode`, () => {
        expect(isPhaseIdValidForVideoType(phase, 'episode')).toBe(true)
      })

      it(`${phase} is NOT valid for cut`, () => {
        expect(isPhaseIdValidForVideoType(phase, 'cut')).toBe(false)
      })

      it(`${phase} is NOT valid for reel`, () => {
        expect(isPhaseIdValidForVideoType(phase, 'reel')).toBe(false)
      })
    })
  })

  describe('title', () => {
    it('is valid for all video types', () => {
      expect(isPhaseIdValidForVideoType('title', 'episode')).toBe(true)
      expect(isPhaseIdValidForVideoType('title', 'cut')).toBe(true)
      expect(isPhaseIdValidForVideoType('title', 'reel')).toBe(true)
    })
  })

  describe('short-title', () => {
    it('is NOT valid for episode', () => {
      expect(isPhaseIdValidForVideoType('short-title', 'episode')).toBe(false)
    })

    it('is valid for cut', () => {
      expect(isPhaseIdValidForVideoType('short-title', 'cut')).toBe(true)
    })

    it('is NOT valid for reel', () => {
      expect(isPhaseIdValidForVideoType('short-title', 'reel')).toBe(false)
    })
  })

  describe('links (episode-only, Epic 26)', () => {
    it('is valid for episode', () => {
      expect(isPhaseIdValidForVideoType('links', 'episode')).toBe(true)
    })
    it('is NOT valid for cut', () => {
      expect(isPhaseIdValidForVideoType('links', 'cut')).toBe(false)
    })
    it('is NOT valid for reel', () => {
      expect(isPhaseIdValidForVideoType('links', 'reel')).toBe(false)
    })
  })

  describe('description/tags/publish (shared phases)', () => {
    const sharedPhases = ['description', 'tags', 'publish'] as const

    sharedPhases.forEach((phase) => {
      it(`${phase} is valid for all video types`, () => {
        expect(isPhaseIdValidForVideoType(phase, 'episode')).toBe(true)
        expect(isPhaseIdValidForVideoType(phase, 'cut')).toBe(true)
        expect(isPhaseIdValidForVideoType(phase, 'reel')).toBe(true)
      })
    })
  })

  describe('unknown video type', () => {
    it('returns false for any phase', () => {
      expect(isPhaseIdValidForVideoType('critique', 'unknown' as VideoTypeForWizard)).toBe(false)
      expect(isPhaseIdValidForVideoType('title', 'unknown' as VideoTypeForWizard)).toBe(false)
    })
  })
})

describe('PHASE_ID_METADATA', () => {
  it('covers all 12 phase ids (incl. links, Epic 26)', () => {
    expect(Object.keys(PHASE_ID_METADATA)).toHaveLength(12)
  })

  it('includes metadata for parent', () => {
    expect(PHASE_ID_METADATA.parent).toEqual({
      phase: 'parent',
      label: 'Vídeo Pai',
      type: 'immutable',
      spinnerText: 'Carregando episódios disponíveis...',
      alertTitle: 'Seleção de Vídeo Pai',
    })
  })

  it('includes metadata for short-title', () => {
    expect(PHASE_ID_METADATA['short-title']).toEqual({
      phase: 'short-title',
      label: 'Título Curto',
      type: 'reprocessable',
      spinnerText: 'Gerando sugestões de título curto para thumbnail...',
      alertTitle: 'Títulos Curtos',
    })
  })

  it('derives label/type for the core phases', () => {
    expect(PHASE_ID_METADATA.title.label).toBe('Título')
    expect(PHASE_ID_METADATA['short-title'].label).toBe('Título Curto')
    expect(PHASE_ID_METADATA.parent.label).toBe('Vídeo Pai')
    expect(PHASE_ID_METADATA.publish.type).toBe('final')
  })

  it('parent is immutable', () => {
    expect(PHASE_ID_METADATA.parent.type).toBe('immutable')
  })

  it('short-title is reprocessable', () => {
    expect(PHASE_ID_METADATA['short-title'].type).toBe('reprocessable')
  })

  it('thumbnail is reprocessable (Epic 22)', () => {
    expect(PHASE_ID_METADATA.thumbnail.type).toBe('reprocessable')
    expect(PHASE_ID_METADATA.thumbnail.label).toBe('Thumbnail')
  })

  it('links has label "Links" (Epic 26)', () => {
    expect(PHASE_ID_METADATA.links.label).toBe('Links')
    expect(PHASE_ID_METADATA.links.phase).toBe('links')
  })

  it('each entry has a self-consistent phase field', () => {
    for (const [id, meta] of Object.entries(PHASE_ID_METADATA)) {
      expect(meta.phase).toBe(id)
    }
  })
})

describe('REPROCESSABLE_PHASE_IDS / IMMUTABLE_PHASE_IDS', () => {
  it('classifies tracked reprocessable phases', () => {
    expect(REPROCESSABLE_PHASE_IDS).toEqual(['title', 'description', 'tags'])
  })

  it('classifies tracked immutable phases', () => {
    expect(IMMUTABLE_PHASE_IDS).toEqual(['critique', 'edit-check', 'risk', 'chapters'])
  })

  it('isReprocessablePhaseId agrees with the metadata', () => {
    expect(isReprocessablePhaseId('title')).toBe(true)
    expect(isReprocessablePhaseId('tags')).toBe(true)
    expect(isReprocessablePhaseId('critique')).toBe(false)
    expect(isReprocessablePhaseId('publish')).toBe(false)
  })
})

describe('getPhaseIdsToInvalidate', () => {
  it('returns only tracked phases after the given phase (canonical order)', () => {
    expect(getPhaseIdsToInvalidate('title')).toEqual(['description', 'tags', 'publish'])
  })

  it('returns all later tracked phases when reprocessing from the first', () => {
    expect(getPhaseIdsToInvalidate('critique')).toEqual([
      'edit-check',
      'risk',
      'chapters',
      'title',
      'description',
      'tags',
      'publish',
    ])
  })

  it('returns empty for the last phase', () => {
    expect(getPhaseIdsToInvalidate('publish')).toEqual([])
  })
})

// ============================================================================
// Epic 22 / Story 22.3a — getPhaseIdsForVideoTypeWithFeatures
// ============================================================================

describe('getPhaseIdsForVideoTypeWithFeatures (Epic 22)', () => {
  describe('with thumbnailGeneration disabled or undefined', () => {
    it('returns the base flow for episode', () => {
      const base = getPhaseIdsForVideoType('episode')
      expect(getPhaseIdsForVideoTypeWithFeatures('episode')).toEqual(base)
      expect(getPhaseIdsForVideoTypeWithFeatures('episode', {})).toEqual(base)
      expect(getPhaseIdsForVideoTypeWithFeatures('episode', { thumbnailGeneration: false })).toEqual(
        base
      )
    })

    it('returns the base flow for cut', () => {
      const base = getPhaseIdsForVideoType('cut')
      expect(getPhaseIdsForVideoTypeWithFeatures('cut')).toEqual(base)
      expect(getPhaseIdsForVideoTypeWithFeatures('cut', { thumbnailGeneration: false })).toEqual(
        base
      )
    })

    it('returns the base flow for reel', () => {
      const base = getPhaseIdsForVideoType('reel')
      expect(getPhaseIdsForVideoTypeWithFeatures('reel')).toEqual(base)
      expect(getPhaseIdsForVideoTypeWithFeatures('reel', { thumbnailGeneration: false })).toEqual(
        base
      )
    })
  })

  describe('with thumbnailGeneration enabled', () => {
    it("inserts 'thumbnail' between tags and links for episode (Epic 26: …tags → thumbnail → links → publish)", () => {
      expect(getPhaseIdsForVideoTypeWithFeatures('episode', { thumbnailGeneration: true })).toEqual([
        'critique',
        'edit-check',
        'risk',
        'chapters',
        'title',
        'description',
        'tags',
        'thumbnail',
        'links',
        'publish',
      ])
    })

    it("inserts 'thumbnail' between tags and publish for cut", () => {
      expect(getPhaseIdsForVideoTypeWithFeatures('cut', { thumbnailGeneration: true })).toEqual([
        'parent',
        'title',
        'short-title',
        'description',
        'tags',
        'thumbnail',
        'publish',
      ])
    })

    it('does NOT insert thumbnail for reel (out of scope by Epic 22 decision)', () => {
      expect(getPhaseIdsForVideoTypeWithFeatures('reel', { thumbnailGeneration: true })).toEqual([
        'parent',
        'title',
        'description',
        'tags',
        'publish',
      ])
    })
  })

  describe('with standalone (Epic 25 — editorial flag)', () => {
    it('drops parent for a standalone cut (no thumbnail feature)', () => {
      expect(getPhaseIdsForVideoTypeWithFeatures('cut', undefined, true)).toEqual([
        'title',
        'short-title',
        'description',
        'tags',
        'publish',
      ])
    })

    it('drops parent for a standalone reel', () => {
      expect(getPhaseIdsForVideoTypeWithFeatures('reel', undefined, true)).toEqual([
        'title',
        'description',
        'tags',
        'publish',
      ])
    })

    it('keeps thumbnail (by duration) for a standalone cut with the feature on', () => {
      expect(
        getPhaseIdsForVideoTypeWithFeatures('cut', { thumbnailGeneration: true }, true)
      ).toEqual(['title', 'short-title', 'description', 'tags', 'thumbnail', 'publish'])
    })

    it('never adds thumbnail to a standalone reel even with the feature on', () => {
      expect(
        getPhaseIdsForVideoTypeWithFeatures('reel', { thumbnailGeneration: true }, true)
      ).toEqual(['title', 'description', 'tags', 'publish'])
    })

    it('drops the analysis phases for a standalone episode (out-of-scope but safe)', () => {
      // episode+standalone is not a real product case (decision Wellington), but
      // the filter must still behave: parent + critique/edit-check/risk/chapters out.
      // 'links' stays (episode phase, not podcast-only).
      expect(getPhaseIdsForVideoTypeWithFeatures('episode', undefined, true)).toEqual([
        'title',
        'description',
        'tags',
        'links',
        'publish',
      ])
    })

    it('standalone=false is identical to the non-standalone flow (regression)', () => {
      for (const vt of ['episode', 'cut', 'reel'] as const) {
        expect(getPhaseIdsForVideoTypeWithFeatures(vt, undefined, false)).toEqual(
          getPhaseIdsForVideoTypeWithFeatures(vt)
        )
        expect(
          getPhaseIdsForVideoTypeWithFeatures(vt, { thumbnailGeneration: true }, false)
        ).toEqual(getPhaseIdsForVideoTypeWithFeatures(vt, { thumbnailGeneration: true }))
      }
    })
  })

  it('does not mutate the original PHASE_IDS_BY_VIDEO_TYPE arrays', () => {
    getPhaseIdsForVideoTypeWithFeatures('episode', { thumbnailGeneration: true })
    expect(PHASE_IDS_BY_VIDEO_TYPE.episode).toEqual([
      'critique',
      'edit-check',
      'risk',
      'chapters',
      'title',
      'description',
      'tags',
      'links',
      'publish',
    ])
    expect(PHASE_IDS_BY_VIDEO_TYPE.cut).toEqual([
      'parent',
      'title',
      'short-title',
      'description',
      'tags',
      'publish',
    ])
  })
})
