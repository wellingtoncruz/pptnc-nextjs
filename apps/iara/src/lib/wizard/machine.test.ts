import { describe, expect, it } from 'vitest'

import {
  canNavigateToPhase,
  createInitialWizardState,
  getFirstIncompletePhase,
  getNextPhase,
  getNextPhaseForType,
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

  it('starts at phase 1 for episode video type', () => {
    const state = createInitialWizardState('video-123', 'episode')
    expect(state.currentPhase).toBe(1)
  })

  it('starts at phase 0 for reel without parent', () => {
    const state = createInitialWizardState('video-123', 'reel')
    // Phase 0 is cast to WizardPhase for type safety
    expect(state.currentPhase as number).toBe(0)
  })

  it('starts at phase 0 for cut without parent', () => {
    const state = createInitialWizardState('video-123', 'cut')
    expect(state.currentPhase as number).toBe(0)
  })

  it('starts at phase 5 for reel with parent', () => {
    const state = createInitialWizardState('video-123', 'reel', 'parent-episode-id')
    expect(state.currentPhase).toBe(5)
  })

  it('starts at phase 5 for cut with parent', () => {
    const state = createInitialWizardState('video-123', 'cut', 'parent-episode-id')
    expect(state.currentPhase).toBe(5)
  })

  it('defaults to episode flow when videoType is undefined', () => {
    const state = createInitialWizardState('video-123', undefined)
    expect(state.currentPhase).toBe(1)
  })

  it('includes videoType in state', () => {
    const episodeState = createInitialWizardState('video-123', 'episode')
    expect(episodeState.videoType).toBe('episode')

    const cutState = createInitialWizardState('video-123', 'cut')
    expect(cutState.videoType).toBe('cut')

    const reelState = createInitialWizardState('video-123', 'reel')
    expect(reelState.videoType).toBe('reel')
  })

  it('defaults videoType to episode when not provided', () => {
    const state = createInitialWizardState('video-123')
    expect(state.videoType).toBe('episode')
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

    describe('with videoType-aware navigation', () => {
      it('cut: phase 5 advances to 5B (not 6)', () => {
        const state = createInitialWizardState('video-123', 'cut', 'parent-id')
        state.currentPhase = 5
        const data = { selectedTitle: 'Test Title' }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 5,
          data,
        })

        // Phase 5 should be completed
        expect(newState.phases[5].status).toBe('completed')
        expect(newState.phases[5].data).toEqual(data)
        // Current phase should be '5B' for cut videos
        expect(newState.currentPhase as string).toBe('5B')
      })

      it('reel: phase 5 advances to 6 (no 5B for reel)', () => {
        const state = createInitialWizardState('video-123', 'reel', 'parent-id')
        state.currentPhase = 5
        const data = { selectedTitle: 'Test Title' }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 5,
          data,
        })

        // Phase 5 should be completed
        expect(newState.phases[5].status).toBe('completed')
        // Current phase should be 6 for reel videos (no 5B)
        expect(newState.currentPhase).toBe(6)
      })

      it('episode: phase 5 advances to 6', () => {
        const state = createInitialWizardState('video-123', 'episode')
        // Mark phases 1-4 as completed
        for (let phase = 1; phase <= 4; phase++) {
          state.phases[phase as 1].status = 'completed'
        }
        state.currentPhase = 5
        const data = { selectedTitle: 'Test Title' }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 5,
          data,
        })

        // Current phase should be 6 for episode videos
        expect(newState.currentPhase).toBe(6)
      })

      it('cut/reel: phase 0 advances to 5', () => {
        const state = createInitialWizardState('video-123', 'cut')
        // Phase 0 is the starting phase for cut without parent
        expect(state.currentPhase as number).toBe(0)

        const data = { parentEpisodeId: 'ep-123' }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 0,
          data,
        })

        // Current phase should be 5 (next after 0 for cut)
        expect(newState.currentPhase).toBe(5)
        // Phase 0 is NOT tracked in phases record, so phases should be unchanged
        expect(newState.phases).toEqual(state.phases)
      })

      it('cut: phase 5B advances to 6', () => {
        const state = createInitialWizardState('video-123', 'cut', 'parent-id')
        // Simulate being on phase 5B
        state.currentPhase = '5B' as unknown as 5

        const data = { shortTitle: 'IMPACTANTE!' }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: '5B',
          data,
        })

        // Current phase should be 6
        expect(newState.currentPhase).toBe(6)
        // Phase 5B is NOT tracked in phases record, so phases should be unchanged
        expect(newState.phases).toEqual(state.phases)
      })

      it('cut: phase 7 advances to 8 (AUTO-READY target)', () => {
        const state = createInitialWizardState('video-123', 'cut', 'parent-id')
        state.currentPhase = 7 as 7
        const data = { tags: ['tag1', 'tag2'] }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 7,
          data,
        })

        expect(newState.phases[7].status).toBe('completed')
        expect(newState.phases[7].data).toEqual(data)
        expect(newState.currentPhase).toBe(8)
      })

      it('reel: phase 7 advances to 8 (AUTO-READY target)', () => {
        const state = createInitialWizardState('video-123', 'reel', 'parent-id')
        state.currentPhase = 7 as 7
        const data = { tags: ['tag1'] }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 7,
          data,
        })

        expect(newState.phases[7].status).toBe('completed')
        expect(newState.phases[7].data).toEqual(data)
        expect(newState.currentPhase).toBe(8)
      })

      it('extended phases (0 and 5B) do not modify phases record', () => {
        // Phase 0
        const state0 = createInitialWizardState('video-123', 'cut')
        const newState0 = wizardReducer(state0, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 0,
          data: { parentEpisodeId: 'ep-123' },
        })
        expect(newState0.phases).toEqual(state0.phases)

        // Phase 5B
        const state5B = createInitialWizardState('video-123', 'cut', 'parent-id')
        state5B.currentPhase = '5B' as unknown as 5
        const newState5B = wizardReducer(state5B, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: '5B',
          data: { shortTitle: 'Test' },
        })
        expect(newState5B.phases).toEqual(state5B.phases)
      })
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

    it('preserves videoType when resetting', () => {
      const state = createInitialWizardState('video-123', 'cut', 'parent-id')
      state.currentPhase = 6
      state.phases[5].status = 'completed'

      const newState = wizardReducer(state, { type: 'RESET' })

      // videoType should be preserved
      expect(newState.videoType).toBe('cut')
      // currentPhase should be initial for cut (0 without parent)
      expect(newState.currentPhase as number).toBe(0)
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
    it('marks phases as completed when video has data and phases are reviewed', () => {
      const state = createInitialWizardState('video-123')
      // All phases are pending (fresh localStorage)

      const videoData = {
        critique: 'Great video!',
        editingIssues: [],
        riskAndCompliance: [],
        reviewedPhases: [2, 3], // Phases 2 and 3 were confirmed by user
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

    it('marks phases 2 and 3 as needs_review when data exists but not reviewed', () => {
      const state = createInitialWizardState('video-123')
      // All phases are pending (fresh localStorage)

      const videoData = {
        critique: 'Great video!',
        editingIssues: [],
        riskAndCompliance: [],
        // No reviewedPhases - phases 2 and 3 need confirmation
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Phase 1 should be completed (no review needed)
      expect(newState.phases[1].status).toBe('completed')
      // Phases 2 and 3 should be needs_review (data exists but not confirmed)
      expect(newState.phases[2].status).toBe('needs_review')
      expect(newState.phases[3].status).toBe('needs_review')
      // Phase 4 should still be pending
      expect(newState.phases[4].status).toBe('pending')
      // Current phase should be first incomplete (2 - needs_review counts as incomplete)
      expect(newState.currentPhase).toBe(2)
    })

    it('resets completed phases when video data is missing (Firestore is source of truth)', () => {
      // Story 5.3 fix: HYDRATE_FROM_VIDEO_DATA now resets phases when Firestore
      // doesn't have data, even if localStorage says completed.
      // This fixes the "infinite spinner" bug caused by stale localStorage.
      const state = createInitialWizardState('video-123')
      state.phases[1].status = 'completed'
      state.phases[2].status = 'completed'
      state.currentPhase = 3

      // Video only has phase 1 data - phase 2 has no data in Firestore
      const videoData = {
        critique: 'Great video!',
        // No editingIssues - Firestore is truth, phase 2 should be reset
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Phase 1 stays completed (has data), Phase 2 is reset to pending (no data)
      expect(newState.phases[1].status).toBe('completed')
      expect(newState.phases[2].status).toBe('pending')
      // currentPhase should be corrected to first incomplete phase
      expect(newState.currentPhase).toBe(2)
    })

    it('returns same state when no changes needed', () => {
      const state = createInitialWizardState('video-123')
      state.phases[1].status = 'completed'
      state.currentPhase = 2 // Correct current phase for completed phase 1

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

    it('corrects currentPhase when it is ahead of first incomplete phase', () => {
      const state = createInitialWizardState('video-123')
      // Simulate corrupted localStorage: currentPhase is 6 but no phases completed
      state.currentPhase = 6

      const videoData = {} // No data in video

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Should correct currentPhase to 1 (first incomplete phase)
      expect(newState.currentPhase).toBe(1)
    })

    it('resets all completed phases when video data is empty (Firestore is source of truth)', () => {
      // Story 5.3 fix: If Firestore has no data, phases cannot be completed.
      // This prevents the "infinite spinner" bug from stale localStorage.
      const state = createInitialWizardState('video-123')
      // localStorage says phases 1-3 are completed (stale)
      state.phases[1].status = 'completed'
      state.phases[2].status = 'completed'
      state.phases[3].status = 'completed'
      state.currentPhase = 4

      // Firestore has no data - this is the source of truth
      const videoData = {}

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // All phases should be reset to pending - Firestore has no data
      expect(newState.phases[1].status).toBe('pending')
      expect(newState.phases[2].status).toBe('pending')
      expect(newState.phases[3].status).toBe('pending')
      // currentPhase should be corrected to first incomplete phase (1)
      expect(newState.currentPhase).toBe(1)
    })

    it('keeps currentPhase when no changes needed and state is valid', () => {
      const state = createInitialWizardState('video-123')
      state.phases[1].status = 'completed'
      state.phases[2].status = 'completed'
      state.currentPhase = 3 // At first incomplete phase

      // Phase 2 has data AND is reviewed, so it stays completed
      const videoData = {
        critique: 'Great!',
        editingIssues: [],
        reviewedPhases: [2], // Phase 2 was confirmed by user
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // No changes - video data matches localStorage, currentPhase is valid
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
        reviewedPhases: [2, 3, 4], // Phases 2, 3, and 4 were confirmed by user
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // All phases should be completed (including 2, 3, and 4 since they were reviewed)
      for (let i = 1; i <= 8; i++) {
        expect(newState.phases[i as 1].status).toBe('completed')
      }
      expect(newState.currentPhase).toBe(8)
    })

    it('correctly identifies first incomplete phase', () => {
      const state = createInitialWizardState('video-123')

      // Video has data for phases 1, 2, 3, 5 (skipping 4)
      // Phases 2 and 3 are reviewed
      const videoData = {
        critique: 'Great video!',
        editingIssues: [],
        riskAndCompliance: [],
        // No chapters (phase 4)
        suggestedTitles: ['Title 1', 'Title 2'],
        reviewedPhases: [2, 3], // Phases 2 and 3 were confirmed by user
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

    describe('reel/cut video type support', () => {
      it('marks phases 1-4 as completed for reel video', () => {
        const state = createInitialWizardState('video-123', 'reel', 'parent-id')

        const videoData = {
          videoType: 'reel' as const,
          parentEpisodeId: 'parent-id',
        }

        const newState = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
        })

        // Phases 1-4 should be auto-completed for reel (skipped)
        expect(newState.phases[1].status).toBe('completed')
        expect(newState.phases[2].status).toBe('completed')
        expect(newState.phases[3].status).toBe('completed')
        expect(newState.phases[4].status).toBe('completed')
        // Phase 5 should be pending (first reel phase after parent selection)
        expect(newState.phases[5].status).toBe('pending')
        // Current phase should be 5
        expect(newState.currentPhase).toBe(5)
      })

      it('sets phase 0 for reel without parentEpisodeId', () => {
        const state = createInitialWizardState('video-123', 'reel')

        const videoData = {
          videoType: 'reel' as const,
          // No parentEpisodeId
        }

        const newState = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
        })

        // Should go to phase 0 for parent selection
        expect(newState.currentPhase as number).toBe(0)
      })

      it('skips to phase 5 for reel with suggestedTitles', () => {
        const state = createInitialWizardState('video-123', 'reel', 'parent-id')

        const videoData = {
          videoType: 'reel' as const,
          parentEpisodeId: 'parent-id',
          suggestedTitles: ['Title 1', 'Title 2'],
        }

        const newState = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
        })

        // Phase 5 should be completed (has suggested titles)
        expect(newState.phases[5].status).toBe('completed')
        // Current phase should be 6
        expect(newState.currentPhase).toBe(6)
      })

      it('handles full reel flow completion', () => {
        const state = createInitialWizardState('video-123', 'reel', 'parent-id')

        const videoData = {
          videoType: 'reel' as const,
          parentEpisodeId: 'parent-id',
          suggestedTitles: ['Title 1'],
          description: 'Reel description',
          tags: ['reel', 'short'],
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

      it('marks phases 1-4 as completed for cut video', () => {
        const state = createInitialWizardState('video-123', 'cut', 'parent-id')

        const videoData = {
          videoType: 'cut' as const,
          parentEpisodeId: 'parent-id',
        }

        const newState = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
        })

        // Phases 1-4 should be auto-completed for cut (skipped)
        expect(newState.phases[1].status).toBe('completed')
        expect(newState.phases[2].status).toBe('completed')
        expect(newState.phases[3].status).toBe('completed')
        expect(newState.phases[4].status).toBe('completed')
        // Current phase should be 5
        expect(newState.currentPhase).toBe(5)
      })
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

describe('getNextPhaseForType', () => {
  describe('episode video type', () => {
    it('returns sequential phases 1->2->...->8', () => {
      expect(getNextPhaseForType(1, 'episode')).toBe(2)
      expect(getNextPhaseForType(2, 'episode')).toBe(3)
      expect(getNextPhaseForType(5, 'episode')).toBe(6)
      expect(getNextPhaseForType(7, 'episode')).toBe(8)
    })

    it('returns null for last phase', () => {
      expect(getNextPhaseForType(8, 'episode')).toBeNull()
    })

    it('returns null for phase not in episode flow', () => {
      expect(getNextPhaseForType(0, 'episode')).toBeNull()
      expect(getNextPhaseForType('5B', 'episode')).toBeNull()
    })
  })

  describe('cut video type', () => {
    it('follows cut flow: 0->5->5B->6->7->8', () => {
      expect(getNextPhaseForType(0, 'cut')).toBe(5)
      expect(getNextPhaseForType(5, 'cut')).toBe('5B')
      expect(getNextPhaseForType('5B', 'cut')).toBe(6)
      expect(getNextPhaseForType(6, 'cut')).toBe(7)
      expect(getNextPhaseForType(7, 'cut')).toBe(8)
    })

    it('returns null for last phase', () => {
      expect(getNextPhaseForType(8, 'cut')).toBeNull()
    })

    it('returns null for phases not in cut flow (1-4)', () => {
      expect(getNextPhaseForType(1, 'cut')).toBeNull()
      expect(getNextPhaseForType(2, 'cut')).toBeNull()
      expect(getNextPhaseForType(3, 'cut')).toBeNull()
      expect(getNextPhaseForType(4, 'cut')).toBeNull()
    })
  })

  describe('reel video type', () => {
    it('follows reel flow: 0->5->6->7->8 (no 5B)', () => {
      expect(getNextPhaseForType(0, 'reel')).toBe(5)
      expect(getNextPhaseForType(5, 'reel')).toBe(6)
      expect(getNextPhaseForType(6, 'reel')).toBe(7)
      expect(getNextPhaseForType(7, 'reel')).toBe(8)
    })

    it('returns null for last phase', () => {
      expect(getNextPhaseForType(8, 'reel')).toBeNull()
    })

    it('returns null for phase 5B (not in reel flow)', () => {
      expect(getNextPhaseForType('5B', 'reel')).toBeNull()
    })
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
