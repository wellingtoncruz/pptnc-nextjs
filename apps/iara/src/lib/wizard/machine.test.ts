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

  describe('COMPLETE_PHASE_AND_ADVANCE', () => {
    it('completes phase and advances to next in one action', () => {
      const state = createInitialWizardState('video-123')
      const data = { critique: 'Great video!' }

      const newState = wizardReducer(state, {
        type: 'COMPLETE_PHASE_AND_ADVANCE',
        phase: 1,
        data,
      })

      // Phase 1 should be completed with data
      expect(newState.phases[1].data).toEqual(data)
      expect(newState.phases[1].status).toBe('completed')
      expect(newState.phases[1].error).toBeNull()
      // Current phase should advance to 2
      expect(newState.currentPhase).toBe(2)
    })

    it('stays on phase 8 when completing last phase', () => {
      const state = createInitialWizardState('video-123')
      // Mark phases 1-7 as completed
      for (let phase = 1; phase <= 7; phase++) {
        state.phases[phase as 1].status = 'completed'
      }
      state.currentPhase = 8
      const data = { published: true }

      const newState = wizardReducer(state, {
        type: 'COMPLETE_PHASE_AND_ADVANCE',
        phase: 8,
        data,
      })

      // Phase 8 should be completed
      expect(newState.phases[8].status).toBe('completed')
      expect(newState.phases[8].data).toEqual(data)
      // Current phase should stay at 8
      expect(newState.currentPhase).toBe(8)
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

  describe('SYNC_WITH_VIDEO_DATA', () => {
    it('resets completed phases when video data is missing', () => {
      const state = createInitialWizardState('video-123')
      // Mark phases 1-3 as completed in localStorage state
      state.phases[1].status = 'completed'
      state.phases[2].status = 'completed'
      state.phases[3].status = 'completed'
      state.currentPhase = 4

      // But video has no data (user cleared Firestore)
      const videoData = {}

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // All phases should be reset to pending
      expect(newState.phases[1].status).toBe('pending')
      expect(newState.phases[2].status).toBe('pending')
      expect(newState.phases[3].status).toBe('pending')
      // Current phase should be set to first incomplete (1)
      expect(newState.currentPhase).toBe(1)
    })

    it('keeps completed phases when video data exists', () => {
      const state = createInitialWizardState('video-123')
      state.phases[1].status = 'completed'
      state.phases[2].status = 'completed'
      state.currentPhase = 3

      // Video has data for phases 1 and 2
      const videoData = {
        critique: 'Great video!',
        editingIssues: [], // Empty array is valid for phase 2
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // Phases with data should remain completed
      expect(newState.phases[1].status).toBe('completed')
      expect(newState.phases[2].status).toBe('completed')
      expect(newState.currentPhase).toBe(3)
    })

    it('partially resets phases when some data is missing', () => {
      const state = createInitialWizardState('video-123')
      // Mark phases 1-5 as completed
      for (let i = 1; i <= 5; i++) {
        state.phases[i as 1].status = 'completed'
      }
      state.currentPhase = 6

      // But video only has data for phases 1-3
      const videoData = {
        critique: 'Great video!',
        editingIssues: [],
        riskAndCompliance: [],
        // No chapters (phase 4), no title (phase 5)
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // Phases 1-3 should remain completed
      expect(newState.phases[1].status).toBe('completed')
      expect(newState.phases[2].status).toBe('completed')
      expect(newState.phases[3].status).toBe('completed')
      // Phases 4-5 should be reset
      expect(newState.phases[4].status).toBe('pending')
      expect(newState.phases[5].status).toBe('pending')
      // Current phase should be set to first incomplete (4)
      expect(newState.currentPhase).toBe(4)
    })

    it('returns same state if no changes needed', () => {
      const state = createInitialWizardState('video-123')
      state.phases[1].status = 'completed'

      const videoData = {
        critique: 'Great video!',
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // Should return same state reference (no changes)
      expect(newState).toBe(state)
    })

    it('does not affect pending phases', () => {
      const state = createInitialWizardState('video-123')
      state.phases[1].status = 'completed'
      // Phase 2 is pending (default)

      const videoData = {
        critique: 'Great video!',
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // Pending phase should remain pending
      expect(newState.phases[2].status).toBe('pending')
    })

    it('handles phase 8 by checking status === sent', () => {
      const state = createInitialWizardState('video-123')
      for (let i = 1; i <= 8; i++) {
        state.phases[i as 1].status = 'completed'
      }

      // Video is NOT sent (status is something else)
      const videoData = {
        critique: 'Great video!',
        editingIssues: [],
        riskAndCompliance: [],
        chapters: [{ timestamp: '0:00', title: 'Intro' }],
        suggestedTitles: ['Title 1', 'Title 2'],
        description: 'My Description',
        tags: ['tag1'],
        status: 'ready', // NOT 'sent'
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // Phase 8 should be reset because status !== 'sent'
      expect(newState.phases[8].status).toBe('pending')
      expect(newState.currentPhase).toBe(8)
    })

    it('keeps phase 8 completed when video status is sent', () => {
      const state = createInitialWizardState('video-123')
      for (let i = 1; i <= 8; i++) {
        state.phases[i as 1].status = 'completed'
      }

      const videoData = {
        critique: 'Great video!',
        editingIssues: [],
        riskAndCompliance: [],
        chapters: [{ timestamp: '0:00', title: 'Intro' }],
        suggestedTitles: ['Title 1', 'Title 2'],
        description: 'My Description',
        tags: ['tag1'],
        status: 'sent',
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // All phases should remain completed
      expect(newState.phases[8].status).toBe('completed')
    })

    it('requires chapters array to have content for phase 4', () => {
      const state = createInitialWizardState('video-123')
      state.phases[4].status = 'completed'
      state.currentPhase = 5

      // Video has empty chapters array
      const videoData = {
        chapters: [], // Empty - not valid for phase 4
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // Phase 4 should be reset because empty chapters is not valid
      expect(newState.phases[4].status).toBe('pending')
    })

    it('requires tags array to have content for phase 7', () => {
      const state = createInitialWizardState('video-123')
      state.phases[7].status = 'completed'
      state.currentPhase = 8

      // Video has empty tags array
      const videoData = {
        tags: [], // Empty - not valid for phase 7
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // Phase 7 should be reset because empty tags is not valid
      expect(newState.phases[7].status).toBe('pending')
    })

    it('treats empty string as no data for text fields', () => {
      const state = createInitialWizardState('video-123')
      state.phases[1].status = 'completed'
      state.phases[5].status = 'completed'
      state.phases[6].status = 'completed'
      state.currentPhase = 7

      const videoData = {
        critique: '   ', // Whitespace only - not valid
        suggestedTitles: [], // Empty array - not valid for phase 5
        description: '  \n  ', // Whitespace only - not valid
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // All text phases should be reset
      expect(newState.phases[1].status).toBe('pending')
      expect(newState.phases[5].status).toBe('pending')
      expect(newState.phases[6].status).toBe('pending')
    })
  })

  describe('HYDRATE_FROM_VIDEO_DATA', () => {
    it('marks phases as completed when video has data', () => {
      const state = createInitialWizardState('video-123')
      // All phases are pending (fresh localStorage)

      const videoData = {
        critique: 'Great video!',
        editingIssues: [],
        riskAndCompliance: [],
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Phases 1-3 should be marked as completed
      expect(newState.phases[1].status).toBe('completed')
      expect(newState.phases[2].status).toBe('completed')
      expect(newState.phases[3].status).toBe('completed')
      // Phase 4 should still be pending
      expect(newState.phases[4].status).toBe('pending')
      // Current phase should be first incomplete (4)
      expect(newState.currentPhase).toBe(4)
    })

    it('resets completed phases when video data is missing', () => {
      const state = createInitialWizardState('video-123')
      state.phases[1].status = 'completed'
      state.phases[2].status = 'completed'

      // Video only has phase 1 data
      const videoData = {
        critique: 'Great video!',
        // No editingIssues
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Phase 1 should stay completed
      expect(newState.phases[1].status).toBe('completed')
      // Phase 2 should be reset (no data in video)
      expect(newState.phases[2].status).toBe('pending')
      expect(newState.currentPhase).toBe(2)
    })

    it('returns same state when no changes needed', () => {
      const state = createInitialWizardState('video-123')
      state.phases[1].status = 'completed'

      const videoData = {
        critique: 'Great video!',
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // No changes needed - should return same state
      expect(newState).toBe(state)
    })

    it('handles empty localStorage with full video data', () => {
      const state = createInitialWizardState('video-123')
      // All phases pending (empty localStorage)

      const videoData = {
        critique: 'Great video!',
        editingIssues: [],
        riskAndCompliance: [],
        chapters: [{ timestamp: '0:00', title: 'Intro' }],
        suggestedTitles: ['Title 1', 'Title 2'],
        description: 'Description',
        tags: ['tag1'],
        status: 'sent',
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // All phases should be completed
      for (let i = 1; i <= 8; i++) {
        expect(newState.phases[i as 1].status).toBe('completed')
      }
      expect(newState.currentPhase).toBe(8)
    })

    it('correctly identifies first incomplete phase', () => {
      const state = createInitialWizardState('video-123')

      // Video has data for phases 1, 2, 3, 5 (skipping 4)
      const videoData = {
        critique: 'Great video!',
        editingIssues: [],
        riskAndCompliance: [],
        // No chapters (phase 4)
        suggestedTitles: ['Title 1', 'Title 2'],
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Phases 1-3 and 5 should be completed
      expect(newState.phases[1].status).toBe('completed')
      expect(newState.phases[2].status).toBe('completed')
      expect(newState.phases[3].status).toBe('completed')
      expect(newState.phases[4].status).toBe('pending')
      expect(newState.phases[5].status).toBe('completed')
      // Current phase should be first incomplete (4)
      expect(newState.currentPhase).toBe(4)
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
