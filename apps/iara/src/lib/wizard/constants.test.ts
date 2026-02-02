/**
 * Tests for wizard constants, including cut/reel phase mappings.
 */

import { describe, expect, it } from 'vitest'

import {
  EXTENDED_PHASE_METADATA,
  getPhasesForVideoType,
  isPhaseValidForVideoType,
  PHASE_METADATA,
  PHASES_BY_VIDEO_TYPE,
} from './constants'
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
})
