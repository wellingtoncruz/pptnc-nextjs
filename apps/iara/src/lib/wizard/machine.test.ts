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
import { TRACKED_PHASE_IDS, phaseIdOrder } from './phase-id-map'
import type { VideoDataForSync, WizardState } from './types'

describe('createInitialWizardState', () => {
  it('creates initial state with all phases pending', () => {
    const state = createInitialWizardState('video-123')

    expect(state.videoId).toBe('video-123')
    expect(state.currentPhase).toBe('critique')

    for (const phase of TRACKED_PHASE_IDS) {
      expect(state.phases[phase]).toEqual({
        status: 'pending',
        data: null,
        error: null,
      })
    }
  })

  it('starts at critique for episode video type', () => {
    const state = createInitialWizardState('video-123', 'episode')
    expect(state.currentPhase).toBe('critique')
  })

  it('starts at parent for reel without parent', () => {
    const state = createInitialWizardState('video-123', 'reel')
    expect(state.currentPhase).toBe('parent')
  })

  it('starts at parent for cut without parent', () => {
    const state = createInitialWizardState('video-123', 'cut')
    expect(state.currentPhase).toBe('parent')
  })

  it('starts at title for reel with parent', () => {
    const state = createInitialWizardState('video-123', 'reel', 'parent-episode-id')
    expect(state.currentPhase).toBe('title')
  })

  it('starts at title for cut with parent', () => {
    const state = createInitialWizardState('video-123', 'cut', 'parent-episode-id')
    expect(state.currentPhase).toBe('title')
  })

  it('defaults to episode flow when videoType is undefined', () => {
    const state = createInitialWizardState('video-123', undefined)
    expect(state.currentPhase).toBe('critique')
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
      state.phases['critique'].status = 'completed'
      state.phases['edit-check'].status = 'completed'
      state.currentPhase = 'risk'

      const newState = wizardReducer(state, { type: 'SET_PHASE', phase: 'critique' })

      expect(newState.currentPhase).toBe('critique')
    })

    it('navigates to first pending phase', () => {
      const state = createInitialWizardState('video-123')
      state.phases['critique'].status = 'completed'

      const newState = wizardReducer(state, { type: 'SET_PHASE', phase: 'edit-check' })

      expect(newState.currentPhase).toBe('edit-check')
    })

    it('does not navigate to loading phase', () => {
      const state = createInitialWizardState('video-123')
      state.phases['edit-check'].status = 'loading'

      const newState = wizardReducer(state, { type: 'SET_PHASE', phase: 'edit-check' })

      expect(newState.currentPhase).toBe('critique') // Unchanged
    })
  })

  describe('SET_PHASE_STATUS', () => {
    it('updates phase status', () => {
      const state = createInitialWizardState('video-123')

      const newState = wizardReducer(state, {
        type: 'SET_PHASE_STATUS',
        phase: 'critique',
        status: 'loading',
      })

      expect(newState.phases['critique'].status).toBe('loading')
    })

    it('clears error when status changes to non-error', () => {
      const state = createInitialWizardState('video-123')
      state.phases['critique'].error = 'Some error'
      state.phases['critique'].status = 'error'

      const newState = wizardReducer(state, {
        type: 'SET_PHASE_STATUS',
        phase: 'critique',
        status: 'loading',
      })

      expect(newState.phases['critique'].error).toBeNull()
    })
  })

  describe('SET_PHASE_DATA', () => {
    it('sets phase data and marks as completed', () => {
      const state = createInitialWizardState('video-123')
      const data = { critique: 'Great video!' }

      const newState = wizardReducer(state, {
        type: 'SET_PHASE_DATA',
        phase: 'critique',
        data,
      })

      expect(newState.phases['critique'].data).toEqual(data)
      expect(newState.phases['critique'].status).toBe('completed')
      expect(newState.phases['critique'].error).toBeNull()
    })
  })

  describe('SET_PHASE_ERROR', () => {
    it('sets phase error and marks as error', () => {
      const state = createInitialWizardState('video-123')

      const newState = wizardReducer(state, {
        type: 'SET_PHASE_ERROR',
        phase: 'critique',
        error: 'LLM timeout',
      })

      expect(newState.phases['critique'].error).toBe('LLM timeout')
      expect(newState.phases['critique'].status).toBe('error')
    })
  })

  describe('INVALIDATE_FROM_PHASE', () => {
    it('invalidates all phases after the given phase', () => {
      const state = createInitialWizardState('video-123')
      // Mark all phases as completed
      for (const phase of TRACKED_PHASE_IDS) {
        state.phases[phase].status = 'completed'
        state.phases[phase].data = { phase }
      }

      const newState = wizardReducer(state, {
        type: 'INVALIDATE_FROM_PHASE',
        phase: 'title',
      })

      const titleOrder = phaseIdOrder('title')
      for (const phase of TRACKED_PHASE_IDS) {
        if (phaseIdOrder(phase) <= titleOrder) {
          // Up to and including title: unchanged
          expect(newState.phases[phase].status).toBe('completed')
          expect(newState.phases[phase].data).toEqual({ phase })
        } else {
          // After title: reset
          expect(newState.phases[phase].status).toBe('pending')
          expect(newState.phases[phase].data).toBeNull()
        }
      }
    })
  })

  describe('COMPLETE_PHASE_AND_ADVANCE', () => {
    it('completes phase and advances to next in one action', () => {
      const state = createInitialWizardState('video-123')
      const data = { critique: 'Great video!' }

      const newState = wizardReducer(state, {
        type: 'COMPLETE_PHASE_AND_ADVANCE',
        phase: 'critique',
        data,
      })

      // critique should be completed with data
      expect(newState.phases['critique'].data).toEqual(data)
      expect(newState.phases['critique'].status).toBe('completed')
      expect(newState.phases['critique'].error).toBeNull()
      // Current phase should advance to edit-check
      expect(newState.currentPhase).toBe('edit-check')
    })

    it('stays on publish when completing last phase', () => {
      const state = createInitialWizardState('video-123')
      // Mark all but the last phase as completed
      for (const phase of TRACKED_PHASE_IDS) {
        if (phase !== 'publish') state.phases[phase].status = 'completed'
      }
      state.currentPhase = 'publish'
      const data = { published: true }

      const newState = wizardReducer(state, {
        type: 'COMPLETE_PHASE_AND_ADVANCE',
        phase: 'publish',
        data,
      })

      // publish should be completed
      expect(newState.phases['publish'].status).toBe('completed')
      expect(newState.phases['publish'].data).toEqual(data)
      // Current phase should stay at publish
      expect(newState.currentPhase).toBe('publish')
    })

    describe('with videoType-aware navigation', () => {
      it('cut: title advances to short-title (not description)', () => {
        const state = createInitialWizardState('video-123', 'cut', 'parent-id')
        state.currentPhase = 'title'
        const data = { selectedTitle: 'Test Title' }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 'title',
          data,
        })

        // title should be completed
        expect(newState.phases['title'].status).toBe('completed')
        expect(newState.phases['title'].data).toEqual(data)
        // Current phase should be short-title for cut videos
        expect(newState.currentPhase).toBe('short-title')
      })

      it('reel: title advances to description (no short-title for reel)', () => {
        const state = createInitialWizardState('video-123', 'reel', 'parent-id')
        state.currentPhase = 'title'
        const data = { selectedTitle: 'Test Title' }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 'title',
          data,
        })

        // title should be completed
        expect(newState.phases['title'].status).toBe('completed')
        // Current phase should be description for reel videos (no short-title)
        expect(newState.currentPhase).toBe('description')
      })

      it('episode: title advances to description', () => {
        const state = createInitialWizardState('video-123', 'episode')
        // Mark the immutable phases as completed
        for (const phase of ['critique', 'edit-check', 'risk', 'chapters'] as const) {
          state.phases[phase].status = 'completed'
        }
        state.currentPhase = 'title'
        const data = { selectedTitle: 'Test Title' }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 'title',
          data,
        })

        // Current phase should be description for episode videos
        expect(newState.currentPhase).toBe('description')
      })

      it('cut/reel: parent advances to title', () => {
        const state = createInitialWizardState('video-123', 'cut')
        // parent is the starting phase for cut without parent
        expect(state.currentPhase).toBe('parent')

        const data = { parentEpisodeId: 'ep-123' }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 'parent',
          data,
        })

        // Current phase should be title (next after parent for cut)
        expect(newState.currentPhase).toBe('title')
        // parent is NOT tracked in phases record, so phases should be unchanged
        expect(newState.phases).toEqual(state.phases)
      })

      it('cut: short-title advances to description', () => {
        const state = createInitialWizardState('video-123', 'cut', 'parent-id')
        // Simulate being on short-title
        state.currentPhase = 'short-title'

        const data = { shortTitle: 'IMPACTANTE!' }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 'short-title',
          data,
        })

        // Current phase should be description
        expect(newState.currentPhase).toBe('description')
        // short-title is NOT tracked in phases record, so phases should be unchanged
        expect(newState.phases).toEqual(state.phases)
      })

      it('cut: tags advances to publish (AUTO-READY target)', () => {
        const state = createInitialWizardState('video-123', 'cut', 'parent-id')
        state.currentPhase = 'tags'
        const data = { tags: ['tag1', 'tag2'] }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 'tags',
          data,
        })

        expect(newState.phases['tags'].status).toBe('completed')
        expect(newState.phases['tags'].data).toEqual(data)
        expect(newState.currentPhase).toBe('publish')
      })

      it('reel: tags advances to publish (AUTO-READY target)', () => {
        const state = createInitialWizardState('video-123', 'reel', 'parent-id')
        state.currentPhase = 'tags'
        const data = { tags: ['tag1'] }

        const newState = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 'tags',
          data,
        })

        expect(newState.phases['tags'].status).toBe('completed')
        expect(newState.phases['tags'].data).toEqual(data)
        expect(newState.currentPhase).toBe('publish')
      })

      it('extended phases (parent and short-title) do not modify phases record', () => {
        // parent
        const state0 = createInitialWizardState('video-123', 'cut')
        const newState0 = wizardReducer(state0, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 'parent',
          data: { parentEpisodeId: 'ep-123' },
        })
        expect(newState0.phases).toEqual(state0.phases)

        // short-title
        const stateShort = createInitialWizardState('video-123', 'cut', 'parent-id')
        stateShort.currentPhase = 'short-title'
        const newStateShort = wizardReducer(stateShort, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 'short-title',
          data: { shortTitle: 'Test' },
        })
        expect(newStateShort.phases).toEqual(stateShort.phases)
      })
    })
  })

  describe('RESET', () => {
    it('resets all phases to initial state', () => {
      const state = createInitialWizardState('video-123')
      state.currentPhase = 'title'
      state.phases['critique'].status = 'completed'
      state.phases['critique'].data = { foo: 'bar' }

      const newState = wizardReducer(state, { type: 'RESET' })

      expect(newState.videoId).toBe('video-123')
      expect(newState.currentPhase).toBe('critique')
      expect(newState.phases['critique'].status).toBe('pending')
      expect(newState.phases['critique'].data).toBeNull()
    })

    it('preserves videoType when resetting', () => {
      const state = createInitialWizardState('video-123', 'cut', 'parent-id')
      state.currentPhase = 'description'
      state.phases['title'].status = 'completed'

      const newState = wizardReducer(state, { type: 'RESET' })

      // videoType should be preserved
      expect(newState.videoType).toBe('cut')
      // currentPhase should be initial for cut (parent without parent)
      expect(newState.currentPhase).toBe('parent')
    })
  })

  describe('SYNC_WITH_VIDEO_DATA', () => {
    it('resets completed phases when video data is missing', () => {
      const state = createInitialWizardState('video-123')
      // Mark phases 1-3 as completed in localStorage state
      state.phases['critique'].status = 'completed'
      state.phases['edit-check'].status = 'completed'
      state.phases['risk'].status = 'completed'
      state.currentPhase = 'chapters'

      // But video has no data (user cleared Firestore)
      const videoData = {}

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // All phases should be reset to pending
      expect(newState.phases['critique'].status).toBe('pending')
      expect(newState.phases['edit-check'].status).toBe('pending')
      expect(newState.phases['risk'].status).toBe('pending')
      // Current phase should be set to first incomplete (critique)
      expect(newState.currentPhase).toBe('critique')
    })

    it('keeps completed phases when video data exists', () => {
      const state = createInitialWizardState('video-123')
      state.phases['critique'].status = 'completed'
      state.phases['edit-check'].status = 'completed'
      state.currentPhase = 'risk'

      // Video has data for phases 1 and 2
      const videoData = {
        critique: 'Great video!',
        editingIssues: [], // Empty array is valid for edit-check
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // Phases with data should remain completed
      expect(newState.phases['critique'].status).toBe('completed')
      expect(newState.phases['edit-check'].status).toBe('completed')
      expect(newState.currentPhase).toBe('risk')
    })

    it('partially resets phases when some data is missing', () => {
      const state = createInitialWizardState('video-123')
      // Mark phases 1-5 as completed
      for (const phase of ['critique', 'edit-check', 'risk', 'chapters', 'title'] as const) {
        state.phases[phase].status = 'completed'
      }
      state.currentPhase = 'description'

      // But video only has data for phases 1-3
      const videoData = {
        critique: 'Great video!',
        editingIssues: [],
        riskAndCompliance: [],
        // No chapters (chapters), no title (title)
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // Phases 1-3 should remain completed
      expect(newState.phases['critique'].status).toBe('completed')
      expect(newState.phases['edit-check'].status).toBe('completed')
      expect(newState.phases['risk'].status).toBe('completed')
      // Phases 4-5 should be reset
      expect(newState.phases['chapters'].status).toBe('pending')
      expect(newState.phases['title'].status).toBe('pending')
      // Current phase should be set to first incomplete (chapters)
      expect(newState.currentPhase).toBe('chapters')
    })

    it('returns same state if no changes needed', () => {
      const state = createInitialWizardState('video-123')
      state.phases['critique'].status = 'completed'

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
      state.phases['critique'].status = 'completed'
      // edit-check is pending (default)

      const videoData = {
        critique: 'Great video!',
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // Pending phase should remain pending
      expect(newState.phases['edit-check'].status).toBe('pending')
    })

    it('handles phase 8 by checking status === sent', () => {
      const state = createInitialWizardState('video-123')
      for (const phase of TRACKED_PHASE_IDS) {
        state.phases[phase].status = 'completed'
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

      // publish should be reset because status !== 'sent'
      expect(newState.phases['publish'].status).toBe('pending')
      expect(newState.currentPhase).toBe('publish')
    })

    it('keeps phase 8 completed when video status is sent', () => {
      const state = createInitialWizardState('video-123')
      for (const phase of TRACKED_PHASE_IDS) {
        state.phases[phase].status = 'completed'
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
      expect(newState.phases['publish'].status).toBe('completed')
    })

    it('requires chapters array to have content for phase 4', () => {
      const state = createInitialWizardState('video-123')
      state.phases['chapters'].status = 'completed'
      state.currentPhase = 'title'

      // Video has empty chapters array
      const videoData = {
        chapters: [], // Empty - not valid for chapters
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // chapters should be reset because empty chapters is not valid
      expect(newState.phases['chapters'].status).toBe('pending')
    })

    it('requires tags array to have content for phase 7', () => {
      const state = createInitialWizardState('video-123')
      state.phases['tags'].status = 'completed'
      state.currentPhase = 'publish'

      // Video has empty tags array
      const videoData = {
        tags: [], // Empty - not valid for tags
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // tags should be reset because empty tags is not valid
      expect(newState.phases['tags'].status).toBe('pending')
    })

    it('treats empty string as no data for text fields', () => {
      const state = createInitialWizardState('video-123')
      state.phases['critique'].status = 'completed'
      state.phases['title'].status = 'completed'
      state.phases['description'].status = 'completed'
      state.currentPhase = 'tags'

      const videoData = {
        critique: '   ', // Whitespace only - not valid
        suggestedTitles: [], // Empty array - not valid for title
        description: '  \n  ', // Whitespace only - not valid
      }

      const newState = wizardReducer(state, {
        type: 'SYNC_WITH_VIDEO_DATA',
        videoData,
      })

      // All text phases should be reset
      expect(newState.phases['critique'].status).toBe('pending')
      expect(newState.phases['title'].status).toBe('pending')
      expect(newState.phases['description'].status).toBe('pending')
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
        reviewedPhases: ['edit-check', 'risk'], // Phases 2 and 3 were confirmed by user
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Phases 1-3 should be marked as completed
      expect(newState.phases['critique'].status).toBe('completed')
      expect(newState.phases['edit-check'].status).toBe('completed')
      expect(newState.phases['risk'].status).toBe('completed')
      // chapters should still be pending
      expect(newState.phases['chapters'].status).toBe('pending')
      // Current phase should be first incomplete (chapters)
      expect(newState.currentPhase).toBe('chapters')
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

      // critique should be completed (no review needed)
      expect(newState.phases['critique'].status).toBe('completed')
      // edit-check and risk should be needs_review (data exists but not confirmed)
      expect(newState.phases['edit-check'].status).toBe('needs_review')
      expect(newState.phases['risk'].status).toBe('needs_review')
      // chapters should still be pending
      expect(newState.phases['chapters'].status).toBe('pending')
      // Current phase should be first incomplete (edit-check - needs_review counts as incomplete)
      expect(newState.currentPhase).toBe('edit-check')
    })

    it('resets completed phases when video data is missing (Firestore is source of truth)', () => {
      // Story 5.3 fix: HYDRATE_FROM_VIDEO_DATA now resets phases when Firestore
      // doesn't have data, even if localStorage says completed.
      // This fixes the "infinite spinner" bug caused by stale localStorage.
      const state = createInitialWizardState('video-123')
      state.phases['critique'].status = 'completed'
      state.phases['edit-check'].status = 'completed'
      state.currentPhase = 'risk'

      // Video only has phase 1 data - edit-check has no data in Firestore
      const videoData = {
        critique: 'Great video!',
        // No editingIssues - Firestore is truth, edit-check should be reset
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // critique stays completed (has data), edit-check is reset to pending (no data)
      expect(newState.phases['critique'].status).toBe('completed')
      expect(newState.phases['edit-check'].status).toBe('pending')
      // currentPhase should be corrected to first incomplete phase
      expect(newState.currentPhase).toBe('edit-check')
    })

    it('returns same state when no changes needed', () => {
      const state = createInitialWizardState('video-123')
      state.phases['critique'].status = 'completed'
      state.currentPhase = 'edit-check' // Correct current phase for completed critique

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
      // Simulate corrupted localStorage: currentPhase is description but no phases completed
      state.currentPhase = 'description'

      const videoData = {} // No data in video

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Should correct currentPhase to critique (first incomplete phase)
      expect(newState.currentPhase).toBe('critique')
    })

    it('resets all completed phases when video data is empty (Firestore is source of truth)', () => {
      // Story 5.3 fix: If Firestore has no data, phases cannot be completed.
      // This prevents the "infinite spinner" bug from stale localStorage.
      const state = createInitialWizardState('video-123')
      // localStorage says phases 1-3 are completed (stale)
      state.phases['critique'].status = 'completed'
      state.phases['edit-check'].status = 'completed'
      state.phases['risk'].status = 'completed'
      state.currentPhase = 'chapters'

      // Firestore has no data - this is the source of truth
      const videoData = {}

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // All phases should be reset to pending - Firestore has no data
      expect(newState.phases['critique'].status).toBe('pending')
      expect(newState.phases['edit-check'].status).toBe('pending')
      expect(newState.phases['risk'].status).toBe('pending')
      // currentPhase should be corrected to first incomplete phase (critique)
      expect(newState.currentPhase).toBe('critique')
    })

    it('keeps currentPhase when no changes needed and state is valid', () => {
      const state = createInitialWizardState('video-123')
      state.phases['critique'].status = 'completed'
      state.phases['edit-check'].status = 'completed'
      state.currentPhase = 'risk' // At first incomplete phase

      // edit-check has data AND is reviewed, so it stays completed
      const videoData = {
        critique: 'Great!',
        editingIssues: [],
        reviewedPhases: ['edit-check'], // edit-check was confirmed by user
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
        reviewedPhases: ['edit-check', 'risk', 'chapters'], // Phases 2, 3, and 4 were confirmed by user
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // All phases should be completed (including 2, 3, and 4 since they were reviewed)
      for (const phase of TRACKED_PHASE_IDS) {
        expect(newState.phases[phase].status).toBe('completed')
      }
      expect(newState.currentPhase).toBe('publish')
    })

    it('correctly identifies first incomplete phase', () => {
      const state = createInitialWizardState('video-123')

      // Video has data for phases 1, 2, 3, 5 (skipping 4)
      // Phases 2 and 3 are reviewed
      const videoData = {
        critique: 'Great video!',
        editingIssues: [],
        riskAndCompliance: [],
        // No chapters (chapters)
        suggestedTitles: ['Title 1', 'Title 2'],
        reviewedPhases: ['edit-check', 'risk'], // Phases 2 and 3 were confirmed by user
      }

      const newState = wizardReducer(state, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Phases 1-3 and 5 should be completed
      expect(newState.phases['critique'].status).toBe('completed')
      expect(newState.phases['edit-check'].status).toBe('completed')
      expect(newState.phases['risk'].status).toBe('completed')
      expect(newState.phases['chapters'].status).toBe('pending')
      expect(newState.phases['title'].status).toBe('completed')
      // Current phase should be first incomplete (chapters)
      expect(newState.currentPhase).toBe('chapters')
    })

    describe('re-hydration preserves currentPhase (isRehydration: true)', () => {
      it('preserves currentPhase when video status changes (draft → ready)', () => {
        // User is on Phase 8, video transitions draft → ready
        const state = createInitialWizardState('video-1')
        for (const phase of TRACKED_PHASE_IDS) {
          if (phase !== 'publish') state.phases[phase].status = 'completed'
        }
        state.currentPhase = 'publish'

        const videoData: VideoDataForSync = {
          critique: 'Good episode',
          editingIssues: [],
          riskAndCompliance: [],
          chapters: [{ title: 'Intro', timestamp: '00:00' }],
          suggestedTitles: ['Title 1'],
          description: 'A great episode',
          tags: ['tag1'],
          status: 'ready', // changed from draft
          reviewedPhases: ['edit-check', 'risk', 'chapters'],
        }

        const result = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
          isRehydration: true,
        })

        // Should stay on Phase 8
        expect(result.currentPhase).toBe('publish')
      })

      it('preserves currentPhase even when phase statuses change', () => {
        // User is on Phase 8, a re-hydration corrects phase 4 to needs_review
        const state = createInitialWizardState('video-1')
        for (const phase of TRACKED_PHASE_IDS) {
          if (phase !== 'publish') state.phases[phase].status = 'completed'
        }
        state.currentPhase = 'publish'

        const videoData: VideoDataForSync = {
          critique: 'Good episode',
          editingIssues: [],
          riskAndCompliance: [],
          chapters: [{ title: 'Intro', timestamp: '00:00' }],
          suggestedTitles: ['Title 1'],
          description: 'desc',
          tags: ['tag1'],
          status: 'ready',
          reviewedPhases: ['edit-check', 'risk'], // 4 NOT reviewed → will become needs_review
        }

        const result = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
          isRehydration: true,
        })

        // chapters should become needs_review
        expect(result.phases['chapters'].status).toBe('needs_review')
        // But currentPhase should stay at publish
        expect(result.currentPhase).toBe('publish')
      })

      it('still updates phase statuses correctly during re-hydration', () => {
        const state = createInitialWizardState('video-1')
        for (const phase of TRACKED_PHASE_IDS) {
          if (phase !== 'publish') state.phases[phase].status = 'completed'
        }
        state.currentPhase = 'publish'

        // description has no data in Firestore (description removed)
        const videoData: VideoDataForSync = {
          critique: 'Good episode',
          editingIssues: [],
          riskAndCompliance: [],
          chapters: [{ title: 'Intro', timestamp: '00:00' }],
          suggestedTitles: ['Title 1'],
          // No description → description phase should become pending
          tags: ['tag1'],
          status: 'ready',
          reviewedPhases: ['edit-check', 'risk', 'chapters'],
        }

        const result = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
          isRehydration: true,
        })

        // description should be reset to pending
        expect(result.phases['description'].status).toBe('pending')
        // But currentPhase stays at publish
        expect(result.currentPhase).toBe('publish')
      })

      it('preserves currentPhase on re-hydration for cut videos', () => {
        const state = createInitialWizardState('video-1', 'cut', 'parent-1')
        for (const phase of ['critique', 'edit-check', 'risk', 'chapters', 'title'] as const) {
          state.phases[phase] = { status: 'completed', data: null, error: null }
        }
        state.currentPhase = 'description'

        const videoData: VideoDataForSync = {
          videoType: 'cut',
          parentEpisodeId: 'parent-1',
          suggestedTitles: ['Title'],
          suggestedShortTitles: ['Short'],
          description: 'desc',
          tags: ['tag'],
          status: 'ready', // status changed
        }

        const result = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
          isRehydration: true,
        })

        // Should stay on Phase 6 (description)
        expect(result.currentPhase).toBe('description')
      })

      it('preserves currentPhase on re-hydration for reel videos', () => {
        const state = createInitialWizardState('video-1', 'reel', 'parent-1')
        for (const phase of ['critique', 'edit-check', 'risk', 'chapters', 'title'] as const) {
          state.phases[phase] = { status: 'completed', data: null, error: null }
        }
        state.currentPhase = 'tags'

        const videoData: VideoDataForSync = {
          videoType: 'reel',
          parentEpisodeId: 'parent-1',
          suggestedTitles: ['Title'],
          description: 'desc',
          tags: ['tag'],
          status: 'ready', // status changed
        }

        const result = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
          isRehydration: true,
        })

        // Should stay on Phase 7 (tags)
        expect(result.currentPhase).toBe('tags')
      })

      it('preserves currentPhase when phase is in loading status during re-hydration', () => {
        // Simulates: LLM call in progress on phase 5, Firestore updates trigger re-hydration
        const state = createInitialWizardState('video-1')
        for (const phase of ['critique', 'edit-check', 'risk', 'chapters'] as const) {
          state.phases[phase].status = 'completed'
        }
        state.phases['title'].status = 'loading'
        state.currentPhase = 'title'

        const videoData: VideoDataForSync = {
          critique: 'Good episode',
          editingIssues: [],
          riskAndCompliance: [],
          chapters: [{ title: 'Intro', timestamp: '00:00' }],
          // No suggestedTitles (LLM hasn't finished yet)
          status: 'draft',
          reviewedPhases: ['edit-check', 'risk', 'chapters'],
        }

        const result = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
          isRehydration: true,
        })

        // title should stay in loading (not reset to pending)
        expect(result.phases['title'].status).toBe('loading')
        // Should stay on Phase 5 (title)
        expect(result.currentPhase).toBe('title')
      })

      it('returns same state when no phase changes needed on re-hydration', () => {
        const state = createInitialWizardState('video-1')
        state.phases['critique'].status = 'completed'
        state.currentPhase = 'edit-check'

        const videoData: VideoDataForSync = {
          critique: 'Good episode',
        }

        const result = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
          isRehydration: true,
        })

        // No changes needed, should return same state reference
        expect(result).toBe(state)
      })
    })

    describe('initial hydration still navigates correctly (regression)', () => {
      it('navigates to firstIncompletePhase from stale localStorage', () => {
        // localStorage has currentPhase = critique, but Firestore has phases 1-7 completed
        const state = createInitialWizardState('video-1')
        state.currentPhase = 'critique' // stale

        const videoData: VideoDataForSync = {
          critique: 'Good episode',
          editingIssues: [],
          riskAndCompliance: [],
          chapters: [{ title: 'Intro', timestamp: '00:00' }],
          suggestedTitles: ['Title 1'],
          description: 'A great episode',
          tags: ['tag1'],
          status: 'ready',
          reviewedPhases: ['edit-check', 'risk', 'chapters'],
        }

        const result = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
          // No isRehydration flag = initial hydration
        })

        // Should navigate to publish (first incomplete)
        expect(result.currentPhase).toBe('publish')
      })

      it('navigates correctly for cut video initial hydration', () => {
        const state = createInitialWizardState('video-1', 'cut', 'parent-1')

        const videoData: VideoDataForSync = {
          videoType: 'cut',
          parentEpisodeId: 'parent-1',
          suggestedTitles: ['Title 1'],
          suggestedShortTitles: ['Short 1'],
          status: 'draft',
        }

        const result = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
        })

        // title has data, short-title has data, description has no data → firstIncomplete = description
        expect(result.currentPhase).toBe('description')
      })
    })

    describe('Phase 5 → 5B transition for cut (Story 19.2)', () => {
      it('preserves phase 5 completed during re-hydration when on 5B', () => {
        // Simulates: user completed Phase 5 → advanced to 5B → re-hydration fires
        const state = createInitialWizardState('video-1', 'cut', 'parent-1')
        for (const phase of ['critique', 'edit-check', 'risk', 'chapters', 'title'] as const) {
          state.phases[phase] = { status: 'completed', data: null, error: null }
        }
        state.currentPhase = 'short-title'

        const videoData: VideoDataForSync = {
          videoType: 'cut',
          parentEpisodeId: 'parent-1',
          suggestedTitles: ['Title 1', 'Title 2'], // Phase 5 data exists
          // No suggestedShortTitles yet — user is working on 5B
          status: 'draft',
        }

        const result = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
          isRehydration: true,
        })

        // title must remain completed
        expect(result.phases['title'].status).toBe('completed')
        // currentPhase must stay at 'short-title'
        expect(result.currentPhase).toBe('short-title')
      })

      it('preserves phase 5 completed on initial hydration when 5B incomplete', () => {
        // Page refresh: localStorage has currentPhase='5B', Firestore has suggestedTitles
        const state = createInitialWizardState('video-1', 'cut', 'parent-1')
        state.currentPhase = 'short-title'

        const videoData: VideoDataForSync = {
          videoType: 'cut',
          parentEpisodeId: 'parent-1',
          suggestedTitles: ['Title 1', 'Title 2'],
          // No suggestedShortTitles
          status: 'draft',
        }

        const result = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
          // Initial hydration (no isRehydration flag)
        })

        // title should be completed (has suggestedTitles)
        expect(result.phases['title'].status).toBe('completed')
        // firstIncompletePhase should be 'short-title' (no short titles yet)
        expect(result.currentPhase).toBe('short-title')
      })

      it('allows navigation back from 5B to completed phase 5', () => {
        const state = createInitialWizardState('video-1', 'cut', 'parent-1')
        for (const phase of ['critique', 'edit-check', 'risk', 'chapters', 'title'] as const) {
          state.phases[phase] = { status: 'completed', data: null, error: null }
        }
        state.currentPhase = 'short-title'

        // title is completed → canNavigateToPhase should return true
        expect(canNavigateToPhase(state, 'title')).toBe(true)
      })

      it('does not affect episode flow (regression)', () => {
        // Episode: Phase 5 → Phase 6 (no 5B)
        const state = createInitialWizardState('video-1', 'episode')
        for (const phase of ['critique', 'edit-check', 'risk', 'chapters'] as const) {
          state.phases[phase].status = 'completed'
        }
        state.currentPhase = 'title'

        const result = wizardReducer(state, {
          type: 'COMPLETE_PHASE_AND_ADVANCE',
          phase: 'title',
          data: { selectedTitle: 'Test' },
        })

        expect(result.phases['title'].status).toBe('completed')
        expect(result.currentPhase).toBe('description')
      })
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
        expect(newState.phases['critique'].status).toBe('completed')
        expect(newState.phases['edit-check'].status).toBe('completed')
        expect(newState.phases['risk'].status).toBe('completed')
        expect(newState.phases['chapters'].status).toBe('completed')
        // title should be pending (first reel phase after parent selection)
        expect(newState.phases['title'].status).toBe('pending')
        // Current phase should be title
        expect(newState.currentPhase).toBe('title')
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

        // Should go to parent for parent selection
        expect(newState.currentPhase).toBe('parent')
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

        // title should be completed (has suggested titles)
        expect(newState.phases['title'].status).toBe('completed')
        // Current phase should be description
        expect(newState.currentPhase).toBe('description')
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
        for (const phase of TRACKED_PHASE_IDS) {
          expect(newState.phases[phase].status).toBe('completed')
        }
        expect(newState.currentPhase).toBe('publish')
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
        expect(newState.phases['critique'].status).toBe('completed')
        expect(newState.phases['edit-check'].status).toBe('completed')
        expect(newState.phases['risk'].status).toBe('completed')
        expect(newState.phases['chapters'].status).toBe('completed')
        // Current phase should be title
        expect(newState.currentPhase).toBe('title')
      })
    })

    describe('phase 5 completion checks suggestedTitles only', () => {
      it('does not mark phase 5 as complete from YouTube provisional title alone', () => {
        // Videos are imported with a YouTube title, but phase 5 should only
        // be considered complete when LLM has generated suggestedTitles
        const state = createInitialWizardState('video-123')

        const videoData: VideoDataForSync = {
          critique: 'Good video',
          editingIssues: [],
          riskAndCompliance: [],
          chapters: ['Ch 1'],
          reviewedPhases: ['edit-check', 'risk'],
          // No suggestedTitles — video has YouTube title but phase 5 not processed
        }

        const newState = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
        })

        // title must remain pending (no suggestedTitles from LLM)
        expect(newState.phases['title'].status).toBe('pending')
      })

      it('preserves phase 5 completed during re-hydration when suggestedTitles exist', () => {
        // Simulates: phase 5 completed (suggestedTitles generated), user advances to 5B,
        // re-hydration triggers — phase 5 should stay completed
        const state = createInitialWizardState('video-123', 'cut', 'parent-id')
        state.phases['title'].status = 'completed'
        state.currentPhase = 'short-title'

        const videoData: VideoDataForSync = {
          videoType: 'cut',
          parentEpisodeId: 'parent-id',
          suggestedTitles: ['Title 1', 'Title 2'],
        }

        const newState = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
          isRehydration: true,
        })

        // title must remain completed
        expect(newState.phases['title'].status).toBe('completed')
        // currentPhase must stay at short-title (re-hydration preserves it)
        expect(newState.currentPhase).toBe('short-title')
      })

      it('resets phase 5 when suggestedTitles are absent', () => {
        const state = createInitialWizardState('video-123')
        state.phases['title'].status = 'completed'
        state.currentPhase = 'description'

        const videoData: VideoDataForSync = {
          critique: 'Good video',
          // No suggestedTitles
        }

        const newState = wizardReducer(state, {
          type: 'HYDRATE_FROM_VIDEO_DATA',
          videoData,
        })

        // title should be reset (no suggestedTitles)
        expect(newState.phases['title'].status).toBe('pending')
      })
    })
  })
})

describe('getNextPhase', () => {
  it('returns next phase', () => {
    expect(getNextPhase('critique')).toBe('edit-check')
    expect(getNextPhase('tags')).toBe('publish')
  })

  it('returns null for last phase', () => {
    expect(getNextPhase('publish')).toBeNull()
  })
})

describe('getNextPhaseForType', () => {
  describe('episode video type', () => {
    it('returns sequential phases 1->2->...->8', () => {
      expect(getNextPhaseForType('critique', 'episode')).toBe('edit-check')
      expect(getNextPhaseForType('edit-check', 'episode')).toBe('risk')
      expect(getNextPhaseForType('title', 'episode')).toBe('description')
      expect(getNextPhaseForType('tags', 'episode')).toBe('publish')
    })

    it('returns null for last phase', () => {
      expect(getNextPhaseForType('publish', 'episode')).toBeNull()
    })

    it('returns null for phase not in episode flow', () => {
      expect(getNextPhaseForType('parent', 'episode')).toBeNull()
      expect(getNextPhaseForType('short-title', 'episode')).toBeNull()
    })
  })

  describe('cut video type', () => {
    it('follows cut flow: 0->5->5B->6->7->8', () => {
      expect(getNextPhaseForType('parent', 'cut')).toBe('title')
      expect(getNextPhaseForType('title', 'cut')).toBe('short-title')
      expect(getNextPhaseForType('short-title', 'cut')).toBe('description')
      expect(getNextPhaseForType('description', 'cut')).toBe('tags')
      expect(getNextPhaseForType('tags', 'cut')).toBe('publish')
    })

    it('returns null for last phase', () => {
      expect(getNextPhaseForType('publish', 'cut')).toBeNull()
    })

    it('returns null for phases not in cut flow (1-4)', () => {
      expect(getNextPhaseForType('critique', 'cut')).toBeNull()
      expect(getNextPhaseForType('edit-check', 'cut')).toBeNull()
      expect(getNextPhaseForType('risk', 'cut')).toBeNull()
      expect(getNextPhaseForType('chapters', 'cut')).toBeNull()
    })
  })

  describe('reel video type', () => {
    it('follows reel flow: 0->5->6->7->8 (no 5B)', () => {
      expect(getNextPhaseForType('parent', 'reel')).toBe('title')
      expect(getNextPhaseForType('title', 'reel')).toBe('description')
      expect(getNextPhaseForType('description', 'reel')).toBe('tags')
      expect(getNextPhaseForType('tags', 'reel')).toBe('publish')
    })

    it('returns null for last phase', () => {
      expect(getNextPhaseForType('publish', 'reel')).toBeNull()
    })

    it('returns null for phase 5B (not in reel flow)', () => {
      expect(getNextPhaseForType('short-title', 'reel')).toBeNull()
    })
  })

  // ===========================================================================
  // Epic 22 — features-aware navigation (Story 22.3a follow-up bug fix)
  // ===========================================================================

  describe('with features.thumbnailGeneration enabled', () => {
    const features = { thumbnailGeneration: true }

    it("routes Tags (7) → 'THUMB' (not 8) for episode", () => {
      // This was the bug: without features, getNextPhaseForType(7, 'episode')
      // returned 8, silently skipping the Thumbnail phase even when the flag
      // was on and PhaseThumbnail was already rendered in the breadcrumb.
      expect(getNextPhaseForType('tags', 'episode', features)).toBe('thumbnail')
    })

    it("routes 'THUMB' → 8 (Publicar) for episode", () => {
      expect(getNextPhaseForType('thumbnail', 'episode', features)).toBe('publish')
    })

    it("routes Tags (7) → 'THUMB' for cut", () => {
      expect(getNextPhaseForType('tags', 'cut', features)).toBe('thumbnail')
    })

    it("does NOT insert 'THUMB' for reel even with flag on", () => {
      // Reel is out of scope for the Thumbnail phase by Epic 22 decision.
      expect(getNextPhaseForType('tags', 'reel', features)).toBe('publish')
    })

    it('keeps earlier phases unchanged for episode (5 → 6, 6 → 7)', () => {
      expect(getNextPhaseForType('title', 'episode', features)).toBe('description')
      expect(getNextPhaseForType('description', 'episode', features)).toBe('tags')
    })

    it('keeps the Cut 5B step intact (5 → 5B → 6)', () => {
      expect(getNextPhaseForType('title', 'cut', features)).toBe('short-title')
      expect(getNextPhaseForType('short-title', 'cut', features)).toBe('description')
    })

    it('falls back to legacy sequence when features.thumbnailGeneration is false', () => {
      // Same shape as omitting features — flag off must behave like before.
      expect(getNextPhaseForType('tags', 'episode', { thumbnailGeneration: false })).toBe('publish')
    })
  })
})

describe('getPreviousPhase', () => {
  it('returns previous phase', () => {
    expect(getPreviousPhase('edit-check')).toBe('critique')
    expect(getPreviousPhase('publish')).toBe('tags')
  })

  it('returns null for first phase', () => {
    expect(getPreviousPhase('critique')).toBeNull()
  })
})

describe('canNavigateToPhase', () => {
  it('allows navigation to completed phases', () => {
    const state = createInitialWizardState('video-123')
    state.phases['critique'].status = 'completed'
    state.phases['edit-check'].status = 'completed'

    expect(canNavigateToPhase(state, 'critique')).toBe(true)
    expect(canNavigateToPhase(state, 'edit-check')).toBe(true)
  })

  it('allows navigation to first pending phase after completed', () => {
    const state = createInitialWizardState('video-123')
    state.phases['critique'].status = 'completed'

    expect(canNavigateToPhase(state, 'edit-check')).toBe(true)
  })

  it('disallows navigation to pending phase if previous not completed', () => {
    const state = createInitialWizardState('video-123')

    expect(canNavigateToPhase(state, 'edit-check')).toBe(false)
    expect(canNavigateToPhase(state, 'title')).toBe(false)
  })

  it('allows navigation to error phase', () => {
    const state = createInitialWizardState('video-123')
    state.phases['critique'].status = 'error'

    expect(canNavigateToPhase(state, 'critique')).toBe(true)
  })

  it('disallows navigation to loading phase', () => {
    const state = createInitialWizardState('video-123')
    state.phases['critique'].status = 'loading'

    expect(canNavigateToPhase(state, 'critique')).toBe(false)
  })
})

describe('getFirstIncompletePhase', () => {
  it('returns first pending phase', () => {
    const state = createInitialWizardState('video-123')
    state.phases['critique'].status = 'completed'
    state.phases['edit-check'].status = 'completed'

    expect(getFirstIncompletePhase(state)).toBe('risk')
  })

  it('returns first error phase', () => {
    const state = createInitialWizardState('video-123')
    state.phases['critique'].status = 'completed'
    state.phases['edit-check'].status = 'error'

    expect(getFirstIncompletePhase(state)).toBe('edit-check')
  })

  it('returns 8 if all completed', () => {
    const state = createInitialWizardState('video-123')
    for (const phase of TRACKED_PHASE_IDS) {
      state.phases[phase].status = 'completed'
    }

    expect(getFirstIncompletePhase(state)).toBe('publish')
  })
})

describe('isWizardComplete', () => {
  it('returns false if any phase not completed', () => {
    const state = createInitialWizardState('video-123')
    for (const phase of TRACKED_PHASE_IDS) {
      if (phase !== 'publish') state.phases[phase].status = 'completed'
    }

    expect(isWizardComplete(state)).toBe(false)
  })

  it('returns true if all phases completed', () => {
    const state = createInitialWizardState('video-123')
    for (const phase of TRACKED_PHASE_IDS) {
      state.phases[phase].status = 'completed'
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
    for (const phase of ['critique', 'edit-check', 'risk', 'chapters'] as const) {
      state.phases[phase].status = 'completed'
    }

    expect(getWizardProgress(state)).toBe(50)
  })

  it('returns 100 for all completed phases', () => {
    const state = createInitialWizardState('video-123')
    for (const phase of TRACKED_PHASE_IDS) {
      state.phases[phase].status = 'completed'
    }

    expect(getWizardProgress(state)).toBe(100)
  })
})
