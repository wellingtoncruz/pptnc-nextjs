import { describe, expect, it } from 'vitest'

import {
  canNavigateToPhase,
  createInitialWizardState,
  getFirstIncompletePhase,
  getNextPhase,
  getPreviousPhase,
  getWizardProgress,
  isWizardComplete,
  wizardReducer,
} from './machine'
import type { WizardState } from './types'

describe('createInitialWizardState', () => {
  it('creates initial state with all phases pending', () => {
    const state = createInitialWizardState('video-123')

    expect(state.videoId).toBe('video-123')
    expect(state.currentPhase).toBe(1)

    for (let phase = 1; phase <= 8; phase++) {
      expect(state.phases[phase as 1]).toEqual({
        status: 'pending',
        data: null,
        error: null,
      })
    }
  })
})

describe('wizardReducer', () => {
  describe('SET_PHASE', () => {
    it('navigates to completed phase', () => {
      const state = createInitialWizardState('video-123')
      state.phases[1].status = 'completed'
      state.phases[2].status = 'completed'
      state.currentPhase = 3

      const newState = wizardReducer(state, { type: 'SET_PHASE', phase: 1 })

      expect(newState.currentPhase).toBe(1)
    })

    it('navigates to first pending phase', () => {
      const state = createInitialWizardState('video-123')
      state.phases[1].status = 'completed'

      const newState = wizardReducer(state, { type: 'SET_PHASE', phase: 2 })

      expect(newState.currentPhase).toBe(2)
    })

    it('does not navigate to loading phase', () => {
      const state = createInitialWizardState('video-123')
      state.phases[2].status = 'loading'

      const newState = wizardReducer(state, { type: 'SET_PHASE', phase: 2 })

      expect(newState.currentPhase).toBe(1) // Unchanged
    })
  })

  describe('SET_PHASE_STATUS', () => {
    it('updates phase status', () => {
      const state = createInitialWizardState('video-123')

      const newState = wizardReducer(state, {
        type: 'SET_PHASE_STATUS',
        phase: 1,
        status: 'loading',
      })

      expect(newState.phases[1].status).toBe('loading')
    })

    it('clears error when status changes to non-error', () => {
      const state = createInitialWizardState('video-123')
      state.phases[1].error = 'Some error'
      state.phases[1].status = 'error'

      const newState = wizardReducer(state, {
        type: 'SET_PHASE_STATUS',
        phase: 1,
        status: 'loading',
      })

      expect(newState.phases[1].error).toBeNull()
    })
  })

  describe('SET_PHASE_DATA', () => {
    it('sets phase data and marks as completed', () => {
      const state = createInitialWizardState('video-123')
      const data = { critique: 'Great video!' }

      const newState = wizardReducer(state, {
        type: 'SET_PHASE_DATA',
        phase: 1,
        data,
      })

      expect(newState.phases[1].data).toEqual(data)
      expect(newState.phases[1].status).toBe('completed')
      expect(newState.phases[1].error).toBeNull()
    })
  })

  describe('SET_PHASE_ERROR', () => {
    it('sets phase error and marks as error', () => {
      const state = createInitialWizardState('video-123')

      const newState = wizardReducer(state, {
        type: 'SET_PHASE_ERROR',
        phase: 1,
        error: 'LLM timeout',
      })

      expect(newState.phases[1].error).toBe('LLM timeout')
      expect(newState.phases[1].status).toBe('error')
    })
  })

  describe('INVALIDATE_FROM_PHASE', () => {
    it('invalidates all phases after the given phase', () => {
      const state = createInitialWizardState('video-123')
      // Mark all phases as completed
      for (let phase = 1; phase <= 8; phase++) {
        state.phases[phase as 1].status = 'completed'
        state.phases[phase as 1].data = { phase }
      }

      const newState = wizardReducer(state, {
        type: 'INVALIDATE_FROM_PHASE',
        phase: 5,
      })

      // Phases 1-5 should be unchanged
      for (let phase = 1; phase <= 5; phase++) {
        expect(newState.phases[phase as 1].status).toBe('completed')
        expect(newState.phases[phase as 1].data).toEqual({ phase })
      }

      // Phases 6-8 should be reset
      for (let phase = 6; phase <= 8; phase++) {
        expect(newState.phases[phase as 1].status).toBe('pending')
        expect(newState.phases[phase as 1].data).toBeNull()
      }
    })
  })

  describe('RESET', () => {
    it('resets all phases to initial state', () => {
      const state = createInitialWizardState('video-123')
      state.currentPhase = 5
      state.phases[1].status = 'completed'
      state.phases[1].data = { foo: 'bar' }

      const newState = wizardReducer(state, { type: 'RESET' })

      expect(newState.videoId).toBe('video-123')
      expect(newState.currentPhase).toBe(1)
      expect(newState.phases[1].status).toBe('pending')
      expect(newState.phases[1].data).toBeNull()
    })
  })
})

describe('getNextPhase', () => {
  it('returns next phase', () => {
    expect(getNextPhase(1)).toBe(2)
    expect(getNextPhase(7)).toBe(8)
  })

  it('returns null for last phase', () => {
    expect(getNextPhase(8)).toBeNull()
  })
})

describe('getPreviousPhase', () => {
  it('returns previous phase', () => {
    expect(getPreviousPhase(2)).toBe(1)
    expect(getPreviousPhase(8)).toBe(7)
  })

  it('returns null for first phase', () => {
    expect(getPreviousPhase(1)).toBeNull()
  })
})

describe('canNavigateToPhase', () => {
  it('allows navigation to completed phases', () => {
    const state = createInitialWizardState('video-123')
    state.phases[1].status = 'completed'
    state.phases[2].status = 'completed'

    expect(canNavigateToPhase(state, 1)).toBe(true)
    expect(canNavigateToPhase(state, 2)).toBe(true)
  })

  it('allows navigation to first pending phase after completed', () => {
    const state = createInitialWizardState('video-123')
    state.phases[1].status = 'completed'

    expect(canNavigateToPhase(state, 2)).toBe(true)
  })

  it('disallows navigation to pending phase if previous not completed', () => {
    const state = createInitialWizardState('video-123')

    expect(canNavigateToPhase(state, 2)).toBe(false)
    expect(canNavigateToPhase(state, 5)).toBe(false)
  })

  it('allows navigation to error phase', () => {
    const state = createInitialWizardState('video-123')
    state.phases[1].status = 'error'

    expect(canNavigateToPhase(state, 1)).toBe(true)
  })

  it('disallows navigation to loading phase', () => {
    const state = createInitialWizardState('video-123')
    state.phases[1].status = 'loading'

    expect(canNavigateToPhase(state, 1)).toBe(false)
  })
})

describe('getFirstIncompletePhase', () => {
  it('returns first pending phase', () => {
    const state = createInitialWizardState('video-123')
    state.phases[1].status = 'completed'
    state.phases[2].status = 'completed'

    expect(getFirstIncompletePhase(state)).toBe(3)
  })

  it('returns first error phase', () => {
    const state = createInitialWizardState('video-123')
    state.phases[1].status = 'completed'
    state.phases[2].status = 'error'

    expect(getFirstIncompletePhase(state)).toBe(2)
  })

  it('returns 8 if all completed', () => {
    const state = createInitialWizardState('video-123')
    for (let phase = 1; phase <= 8; phase++) {
      state.phases[phase as 1].status = 'completed'
    }

    expect(getFirstIncompletePhase(state)).toBe(8)
  })
})

describe('isWizardComplete', () => {
  it('returns false if any phase not completed', () => {
    const state = createInitialWizardState('video-123')
    for (let phase = 1; phase <= 7; phase++) {
      state.phases[phase as 1].status = 'completed'
    }

    expect(isWizardComplete(state)).toBe(false)
  })

  it('returns true if all phases completed', () => {
    const state = createInitialWizardState('video-123')
    for (let phase = 1; phase <= 8; phase++) {
      state.phases[phase as 1].status = 'completed'
    }

    expect(isWizardComplete(state)).toBe(true)
  })
})

describe('getWizardProgress', () => {
  it('returns 0 for no completed phases', () => {
    const state = createInitialWizardState('video-123')

    expect(getWizardProgress(state)).toBe(0)
  })

  it('returns 50 for 4 completed phases', () => {
    const state = createInitialWizardState('video-123')
    for (let phase = 1; phase <= 4; phase++) {
      state.phases[phase as 1].status = 'completed'
    }

    expect(getWizardProgress(state)).toBe(50)
  })

  it('returns 100 for all completed phases', () => {
    const state = createInitialWizardState('video-123')
    for (let phase = 1; phase <= 8; phase++) {
      state.phases[phase as 1].status = 'completed'
    }

    expect(getWizardProgress(state)).toBe(100)
  })
})
