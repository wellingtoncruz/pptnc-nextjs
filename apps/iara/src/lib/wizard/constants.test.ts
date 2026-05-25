/**
 * Tests for wizard constants, including cut/reel phase mappings.
 */

import { describe, expect, it } from 'vitest'

import {
  EXTENDED_PHASE_METADATA,
  getPhasesForVideoType,
  getPhasesForVideoTypeWithFeatures,
  isPhaseValidForVideoType,
  PHASE_METADATA,
  PHASES_BY_VIDEO_TYPE,
  PHASE_IDS_BY_VIDEO_TYPE,
  PHASE_ID_METADATA,
  getPhaseIdsForVideoType,
  getPhaseIdsForVideoTypeWithFeatures,
  isPhaseIdValidForVideoType,
} from './constants'
import { toPhaseId } from './phase-id-map'
import type { ExtendedWizardPhase, VideoTypeForWizard, WizardPhase } from './types'

describe('PHASES_BY_VIDEO_TYPE', () => {
  it('episode has phases 1-8', () => {
    expect(PHASES_BY_VIDEO_TYPE.episode).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('cut has phases 0, 5, 5B, 6, 7, 8', () => {
    expect(PHASES_BY_VIDEO_TYPE.cut).toEqual([0, 5, '5B', 6, 7, 8])
  })

  it('reel has phases 0, 5, 6, 7, 8', () => {
    expect(PHASES_BY_VIDEO_TYPE.reel).toEqual([0, 5, 6, 7, 8])
  })
})

describe('getPhasesForVideoType', () => {
  it('returns correct phases for episode', () => {
    expect(getPhasesForVideoType('episode')).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('returns correct phases for cut', () => {
    expect(getPhasesForVideoType('cut')).toEqual([0, 5, '5B', 6, 7, 8])
  })

  it('returns correct phases for reel', () => {
    expect(getPhasesForVideoType('reel')).toEqual([0, 5, 6, 7, 8])
  })

  it('defaults to episode for unknown type', () => {
    expect(getPhasesForVideoType('unknown' as VideoTypeForWizard)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('isPhaseValidForVideoType', () => {
  describe('phase 0 (parent selection)', () => {
    it('is NOT valid for episode', () => {
      expect(isPhaseValidForVideoType(0, 'episode')).toBe(false)
    })

    it('is valid for cut', () => {
      expect(isPhaseValidForVideoType(0, 'cut')).toBe(true)
    })

    it('is valid for reel', () => {
      expect(isPhaseValidForVideoType(0, 'reel')).toBe(true)
    })
  })

  describe('phases 1-4 (episode-only phases)', () => {
    const episodeOnlyPhases: ExtendedWizardPhase[] = [1, 2, 3, 4]

    episodeOnlyPhases.forEach((phase) => {
      it(`phase ${phase} is valid for episode`, () => {
        expect(isPhaseValidForVideoType(phase, 'episode')).toBe(true)
      })

      it(`phase ${phase} is NOT valid for cut`, () => {
        expect(isPhaseValidForVideoType(phase, 'cut')).toBe(false)
      })

      it(`phase ${phase} is NOT valid for reel`, () => {
        expect(isPhaseValidForVideoType(phase, 'reel')).toBe(false)
      })
    })
  })

  describe('phase 5 (title)', () => {
    it('is valid for all video types', () => {
      expect(isPhaseValidForVideoType(5, 'episode')).toBe(true)
      expect(isPhaseValidForVideoType(5, 'cut')).toBe(true)
      expect(isPhaseValidForVideoType(5, 'reel')).toBe(true)
    })
  })

  describe('phase 5B (short title)', () => {
    it('is NOT valid for episode', () => {
      expect(isPhaseValidForVideoType('5B', 'episode')).toBe(false)
    })

    it('is valid for cut', () => {
      expect(isPhaseValidForVideoType('5B', 'cut')).toBe(true)
    })

    it('is NOT valid for reel', () => {
      expect(isPhaseValidForVideoType('5B', 'reel')).toBe(false)
    })
  })

  describe('phases 6-8 (shared phases)', () => {
    const sharedPhases: ExtendedWizardPhase[] = [6, 7, 8]

    sharedPhases.forEach((phase) => {
      it(`phase ${phase} is valid for all video types`, () => {
        expect(isPhaseValidForVideoType(phase, 'episode')).toBe(true)
        expect(isPhaseValidForVideoType(phase, 'cut')).toBe(true)
        expect(isPhaseValidForVideoType(phase, 'reel')).toBe(true)
      })
    })
  })

  describe('unknown video type', () => {
    it('returns false for any phase', () => {
      expect(isPhaseValidForVideoType(1, 'unknown' as VideoTypeForWizard)).toBe(false)
      expect(isPhaseValidForVideoType(5, 'unknown' as VideoTypeForWizard)).toBe(false)
    })
  })
})

describe('EXTENDED_PHASE_METADATA', () => {
  it('includes metadata for phase 0', () => {
    expect(EXTENDED_PHASE_METADATA[0]).toEqual({
      phase: 0,
      label: 'Vídeo Pai',
      type: 'immutable',
      spinnerText: 'Carregando episódios disponíveis...',
      alertTitle: 'Seleção de Vídeo Pai',
    })
  })

  it('includes metadata for phase 5B', () => {
    expect(EXTENDED_PHASE_METADATA['5B']).toEqual({
      phase: 5,
      label: 'Título Curto',
      type: 'reprocessable',
      spinnerText: 'Gerando sugestões de título curto para thumbnail...',
      alertTitle: 'Títulos Curtos',
    })
  })

  it('includes all original phase metadata (1-8)', () => {
    for (let phase = 1; phase <= 8; phase++) {
      expect(EXTENDED_PHASE_METADATA[phase as ExtendedWizardPhase]).toBeDefined()
      expect(EXTENDED_PHASE_METADATA[phase as ExtendedWizardPhase].phase).toBe(phase)
    }
  })

  it('preserves exact values from PHASE_METADATA for phases 1-8', () => {
    for (let phase = 1; phase <= 8; phase++) {
      expect(EXTENDED_PHASE_METADATA[phase as ExtendedWizardPhase]).toEqual(
        PHASE_METADATA[phase as WizardPhase]
      )
    }
  })

  it('phase 0 is immutable', () => {
    expect(EXTENDED_PHASE_METADATA[0].type).toBe('immutable')
  })

  it('phase 5B is reprocessable', () => {
    expect(EXTENDED_PHASE_METADATA['5B'].type).toBe('reprocessable')
  })

  it('phase THUMB is reprocessable (Epic 22)', () => {
    expect(EXTENDED_PHASE_METADATA.THUMB.type).toBe('reprocessable')
    expect(EXTENDED_PHASE_METADATA.THUMB.label).toBe('Thumbnail')
  })
})

// ============================================================================
// Epic 22 / Story 22.3a — getPhasesForVideoTypeWithFeatures
// ============================================================================

describe('getPhasesForVideoTypeWithFeatures (Epic 22)', () => {
  describe('with thumbnailGeneration disabled or undefined', () => {
    it('returns the same as getPhasesForVideoType for episode', () => {
      expect(getPhasesForVideoTypeWithFeatures('episode')).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(getPhasesForVideoTypeWithFeatures('episode', {})).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      expect(getPhasesForVideoTypeWithFeatures('episode', { thumbnailGeneration: false })).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })

    it('returns the same as getPhasesForVideoType for cut', () => {
      expect(getPhasesForVideoTypeWithFeatures('cut')).toEqual([0, 5, '5B', 6, 7, 8])
      expect(getPhasesForVideoTypeWithFeatures('cut', { thumbnailGeneration: false })).toEqual([0, 5, '5B', 6, 7, 8])
    })

    it('returns the same as getPhasesForVideoType for reel', () => {
      expect(getPhasesForVideoTypeWithFeatures('reel')).toEqual([0, 5, 6, 7, 8])
      expect(getPhasesForVideoTypeWithFeatures('reel', { thumbnailGeneration: false })).toEqual([0, 5, 6, 7, 8])
    })
  })

  describe('with thumbnailGeneration enabled', () => {
    it("inserts 'THUMB' between Tags and Publicar for episode", () => {
      expect(getPhasesForVideoTypeWithFeatures('episode', { thumbnailGeneration: true })).toEqual([
        1, 2, 3, 4, 5, 6, 7, 'THUMB', 8,
      ])
    })

    it("inserts 'THUMB' between Tags and Publicar for cut", () => {
      expect(getPhasesForVideoTypeWithFeatures('cut', { thumbnailGeneration: true })).toEqual([
        0, 5, '5B', 6, 7, 'THUMB', 8,
      ])
    })

    it('does NOT insert THUMB for reel (out of scope by Epic 22 decision)', () => {
      expect(getPhasesForVideoTypeWithFeatures('reel', { thumbnailGeneration: true })).toEqual([
        0, 5, 6, 7, 8,
      ])
    })
  })

  it('does not mutate the original PHASES_BY_VIDEO_TYPE arrays', () => {
    getPhasesForVideoTypeWithFeatures('episode', { thumbnailGeneration: true })
    expect(PHASES_BY_VIDEO_TYPE.episode).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(PHASES_BY_VIDEO_TYPE.cut).toEqual([0, 5, '5B', 6, 7, 8])
  })
})

// ============================================================================
// TD-7 (Story 25.2) — Semantic phase-ID layer
// ============================================================================

describe('semantic phase-ID layer (TD-7)', () => {
  const videoTypes: VideoTypeForWizard[] = ['episode', 'cut', 'reel']

  describe('PHASE_IDS_BY_VIDEO_TYPE', () => {
    it('episode maps to the kebab equivalent of phases 1-8', () => {
      expect(PHASE_IDS_BY_VIDEO_TYPE.episode).toEqual([
        'critique', 'edit-check', 'risk', 'chapters', 'title', 'description', 'tags', 'publish',
      ])
    })

    it('cut maps to parent → title → short-title → description → tags → publish', () => {
      expect(PHASE_IDS_BY_VIDEO_TYPE.cut).toEqual([
        'parent', 'title', 'short-title', 'description', 'tags', 'publish',
      ])
    })

    it('reel maps to parent → title → description → tags → publish', () => {
      expect(PHASE_IDS_BY_VIDEO_TYPE.reel).toEqual([
        'parent', 'title', 'description', 'tags', 'publish',
      ])
    })

    it.each(videoTypes)('stays consistent with the legacy PHASES_BY_VIDEO_TYPE for %s', (vt) => {
      expect(PHASE_IDS_BY_VIDEO_TYPE[vt]).toEqual(PHASES_BY_VIDEO_TYPE[vt].map(toPhaseId))
    })
  })

  describe('getPhaseIdsForVideoType', () => {
    it.each(videoTypes)('mirrors getPhasesForVideoType for %s', (vt) => {
      expect(getPhaseIdsForVideoType(vt)).toEqual(getPhasesForVideoType(vt).map(toPhaseId))
    })
  })

  describe('isPhaseIdValidForVideoType', () => {
    it('accepts a valid phase id for the type', () => {
      expect(isPhaseIdValidForVideoType('short-title', 'cut')).toBe(true)
      expect(isPhaseIdValidForVideoType('title', 'reel')).toBe(true)
    })

    it('rejects a phase id not in the type flow', () => {
      expect(isPhaseIdValidForVideoType('short-title', 'reel')).toBe(false)
      expect(isPhaseIdValidForVideoType('critique', 'cut')).toBe(false)
    })
  })

  describe('getPhaseIdsForVideoTypeWithFeatures', () => {
    it('inserts thumbnail before publish for cut when enabled', () => {
      expect(getPhaseIdsForVideoTypeWithFeatures('cut', { thumbnailGeneration: true })).toEqual([
        'parent', 'title', 'short-title', 'description', 'tags', 'thumbnail', 'publish',
      ])
    })

    it('does not insert thumbnail for reel', () => {
      expect(getPhaseIdsForVideoTypeWithFeatures('reel', { thumbnailGeneration: true })).toEqual([
        'parent', 'title', 'description', 'tags', 'publish',
      ])
    })
  })

  describe('PHASE_ID_METADATA', () => {
    it('derives label/type from the legacy metadata', () => {
      expect(PHASE_ID_METADATA.title.label).toBe('Título')
      expect(PHASE_ID_METADATA['short-title'].label).toBe('Título Curto')
      expect(PHASE_ID_METADATA.thumbnail.label).toBe('Thumbnail')
      expect(PHASE_ID_METADATA.parent.label).toBe('Vídeo Pai')
      expect(PHASE_ID_METADATA.publish.type).toBe('final')
    })

    it('covers all 11 phase ids', () => {
      expect(Object.keys(PHASE_ID_METADATA)).toHaveLength(11)
    })
  })
})
