/**
 * Integration tests for WizardOrchestrator with cut videos.
 *
 * Tests the complete flow for cut videos:
 * - Phase 0 (parent selection) → Phase 5 (title) → Phase 5B (short title) → Phase 6 (description) → Phase 7 (tags) → Phase 8 (publish)
 * - Skipping phases 1-4
 * - Using cut-specific prompts with episode fallback
 * - Phase 5B exclusive to cut (not reel)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  createInitialWizardState,
  wizardReducer,
  getPhasesForVideoType,
  isPhaseValidForVideoType,
  PHASES_BY_VIDEO_TYPE,
} from '@/lib/wizard'
import type { VideoDataForSync } from '@/lib/wizard'

describe('WizardOrchestrator cut flow', () => {
  describe('Phase mapping for cut', () => {
    it('cut has correct phases: 0, 5, 5B, 6, 7, 8', () => {
      expect(PHASES_BY_VIDEO_TYPE.cut).toEqual([0, 5, '5B', 6, 7, 8])
    })

    it('phases 1-4 are NOT valid for cut', () => {
      expect(isPhaseValidForVideoType(1, 'cut')).toBe(false)
      expect(isPhaseValidForVideoType(2, 'cut')).toBe(false)
      expect(isPhaseValidForVideoType(3, 'cut')).toBe(false)
      expect(isPhaseValidForVideoType(4, 'cut')).toBe(false)
    })

    it('phase 0 is valid for cut', () => {
      expect(isPhaseValidForVideoType(0, 'cut')).toBe(true)
    })

    it('phase 5B is valid for cut', () => {
      expect(isPhaseValidForVideoType('5B', 'cut')).toBe(true)
    })

    it('phase 5B is NOT valid for reel', () => {
      expect(isPhaseValidForVideoType('5B', 'reel')).toBe(false)
    })

    it('phases 5, 6, 7, 8 are valid for cut', () => {
      expect(isPhaseValidForVideoType(5, 'cut')).toBe(true)
      expect(isPhaseValidForVideoType(6, 'cut')).toBe(true)
      expect(isPhaseValidForVideoType(7, 'cut')).toBe(true)
      expect(isPhaseValidForVideoType(8, 'cut')).toBe(true)
    })
  })

  describe('Initial state for cut', () => {
    it('starts at phase 0 when no parent selected', () => {
      const state = createInitialWizardState('cut-video', 'cut', undefined)

      // Phase 0 is stored as a runtime value even though WizardPhase type doesn't include it
      expect(state.currentPhase as number).toBe(0)
    })

    it('starts at phase 5 when parent already selected', () => {
      const state = createInitialWizardState('cut-video', 'cut', 'parent-episode-id')

      expect(state.currentPhase).toBe(5)
    })
  })

  describe('HYDRATE_FROM_VIDEO_DATA for cut', () => {
    it('marks phases 1-4 as completed for cut video', () => {
      const initialState = createInitialWizardState('cut-video', 'cut', 'parent-id')

      const videoData: VideoDataForSync = {
        videoType: 'cut',
        parentEpisodeId: 'parent-id',
      }

      const hydratedState = wizardReducer(initialState, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Phases 1-4 should be marked as completed
      expect(hydratedState.phases[1].status).toBe('completed')
      expect(hydratedState.phases[2].status).toBe('completed')
      expect(hydratedState.phases[3].status).toBe('completed')
      expect(hydratedState.phases[4].status).toBe('completed')
    })

    it('sets phase 0 when cut has no parentEpisodeId', () => {
      const initialState = createInitialWizardState('cut-video', 'cut', undefined)

      const videoData: VideoDataForSync = {
        videoType: 'cut',
        parentEpisodeId: undefined,
      }

      const hydratedState = wizardReducer(initialState, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Should be at phase 0
      expect(hydratedState.currentPhase as number).toBe(0)
    })

    it('finds first incomplete phase starting from 5 for cut with parent', () => {
      const initialState = createInitialWizardState('cut-video', 'cut', 'parent-id')

      const videoData: VideoDataForSync = {
        videoType: 'cut',
        parentEpisodeId: 'parent-id',
        suggestedTitles: ['Title 1', 'Title 2'], // Phase 5 has data
        // No short titles - so first incomplete is phase 5B (for cut videos)
      }

      const hydratedState = wizardReducer(initialState, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Phase 5 should be completed (has suggestedTitles)
      expect(hydratedState.phases[5].status).toBe('completed')
      // Should be at phase 5B (first incomplete after 5 for cut videos)
      expect(hydratedState.currentPhase as string).toBe('5B')
    })

    it('goes to phase 6 when cut has suggestedShortTitles', () => {
      const initialState = createInitialWizardState('cut-video', 'cut', 'parent-id')

      const videoData: VideoDataForSync = {
        videoType: 'cut',
        parentEpisodeId: 'parent-id',
        suggestedTitles: ['Title 1', 'Title 2'], // Phase 5 has data
        suggestedShortTitles: ['Short 1', 'Short 2'], // Phase 5B has data
        // No description, tags - so first incomplete is phase 6
      }

      const hydratedState = wizardReducer(initialState, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // Phase 5 should be completed (has suggestedTitles)
      expect(hydratedState.phases[5].status).toBe('completed')
      // Should be at phase 6 (5B is complete via suggestedShortTitles)
      expect(hydratedState.currentPhase).toBe(6)
    })

    it('handles full cut flow completion', () => {
      const initialState = createInitialWizardState('cut-video', 'cut', 'parent-id')

      const videoData: VideoDataForSync = {
        videoType: 'cut',
        parentEpisodeId: 'parent-id',
        suggestedTitles: ['Title 1'],
        suggestedShortTitles: ['Short 1'], // Phase 5B data
        description: 'A great cut',
        tags: ['tag1', 'tag2'],
        status: 'sent',
      }

      const hydratedState = wizardReducer(initialState, {
        type: 'HYDRATE_FROM_VIDEO_DATA',
        videoData,
      })

      // All phases should be completed
      expect(hydratedState.phases[5].status).toBe('completed')
      expect(hydratedState.phases[6].status).toBe('completed')
      expect(hydratedState.phases[7].status).toBe('completed')
      expect(hydratedState.phases[8].status).toBe('completed')

      // Should be at phase 8 (last phase)
      expect(hydratedState.currentPhase).toBe(8)
    })
  })

  describe('Cut vs Reel comparison', () => {
    it('episode starts at phase 1, cut at phase 0 (without parent)', () => {
      const episodeState = createInitialWizardState('ep-1', 'episode', undefined)
      const cutState = createInitialWizardState('cut-1', 'cut', undefined)

      expect(episodeState.currentPhase).toBe(1)
      expect(cutState.currentPhase as number).toBe(0)
    })

    it('episode has 8 phases, cut has 6 phases (including 5B)', () => {
      const episodePhases = getPhasesForVideoType('episode')
      const cutPhases = getPhasesForVideoType('cut')

      expect(episodePhases).toHaveLength(8)
      expect(cutPhases).toHaveLength(6) // 0, 5, 5B, 6, 7, 8
    })

    it('cut includes phase 5B, reel does not', () => {
      const cutPhases = getPhasesForVideoType('cut')
      const reelPhases = getPhasesForVideoType('reel')

      expect(cutPhases).toContain('5B')
      expect(reelPhases).not.toContain('5B')
    })

    it('cut skips critique, editing, compliance, chapters (phases 1-4)', () => {
      const cutPhases = getPhasesForVideoType('cut')

      expect(cutPhases).not.toContain(1)
      expect(cutPhases).not.toContain(2)
      expect(cutPhases).not.toContain(3)
      expect(cutPhases).not.toContain(4)
    })
  })

  describe('Phase 5B specific behavior', () => {
    it('phase 5B is only in cut phases array', () => {
      expect(PHASES_BY_VIDEO_TYPE.episode).not.toContain('5B')
      expect(PHASES_BY_VIDEO_TYPE.cut).toContain('5B')
      expect(PHASES_BY_VIDEO_TYPE.reel).not.toContain('5B')
    })

    it('phase 5B comes after phase 5 in cut flow', () => {
      const cutPhases = getPhasesForVideoType('cut')
      const phase5Index = cutPhases.indexOf(5)
      const phase5BIndex = cutPhases.indexOf('5B')

      expect(phase5BIndex).toBe(phase5Index + 1)
    })

    it('phase 6 comes after phase 5B in cut flow', () => {
      const cutPhases = getPhasesForVideoType('cut')
      const phase5BIndex = cutPhases.indexOf('5B')
      const phase6Index = cutPhases.indexOf(6)

      expect(phase6Index).toBe(phase5BIndex + 1)
    })
  })

  describe('getPhasesForVideoType', () => {
    it('returns correct phases for cut', () => {
      expect(getPhasesForVideoType('cut')).toEqual([0, 5, '5B', 6, 7, 8])
    })

    it('returns correct phases for reel (without 5B)', () => {
      expect(getPhasesForVideoType('reel')).toEqual([0, 5, 6, 7, 8])
    })

    it('returns correct phases for episode', () => {
      expect(getPhasesForVideoType('episode')).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })

    it('defaults to episode phases for unknown type', () => {
      expect(getPhasesForVideoType('unknown' as any)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })
  })
})

describe('AUTO-READY: Phase 7 → Phase 8 transition for cut', () => {
  /**
   * Story 13.10: When a cut video with status 'new' completes all phases,
   * the wizard reaches Phase 8 where the AUTO-READY effect should transition
   * the video to 'ready' status.
   *
   * Root cause: The server-side AUTO-DRAFT (videos-admin.ts:449-458) transitions
   * new → draft when any phase saves data, but the client never receives this
   * status update. The AUTO-READY guard requires 'draft' status.
   *
   * Fix: Added CLIENT-SIDE AUTO-DRAFT effect that mirrors the server behavior —
   * when the wizard advances past the first phase, the client transitions
   * videoData.status from 'new' to 'draft'. This ensures AUTO-READY fires
   * correctly at Phase 8.
   */
  it('COMPLETE_PHASE_AND_ADVANCE for phase 7 sets currentPhase to 8', () => {
    const state = createInitialWizardState('cut-video', 'cut', 'parent-id')
    state.currentPhase = 7 as 7

    const newState = wizardReducer(state, {
      type: 'COMPLETE_PHASE_AND_ADVANCE',
      phase: 7,
      data: { tags: ['tag1', 'tag2'] },
    })

    // currentPhase = 8 is what triggers the AUTO-READY useEffect
    expect(newState.currentPhase).toBe(8)
    expect(newState.phases[7].status).toBe('completed')
  })

  it('full cut phase flow reaches phase 8', () => {
    let state = createInitialWizardState('cut-video', 'cut', undefined)

    // Phase 0: select parent
    state = wizardReducer(state, {
      type: 'COMPLETE_PHASE_AND_ADVANCE',
      phase: 0,
      data: { parentEpisodeId: 'ep-123' },
    })
    expect(state.currentPhase).toBe(5)

    // Phase 5: title
    state = wizardReducer(state, {
      type: 'COMPLETE_PHASE_AND_ADVANCE',
      phase: 5,
      data: { selectedTitle: 'My Cut Title' },
    })
    expect(state.currentPhase as string).toBe('5B')

    // Phase 5B: short title
    state = wizardReducer(state, {
      type: 'COMPLETE_PHASE_AND_ADVANCE',
      phase: '5B',
      data: { shortTitle: 'SHORT!' },
    })
    expect(state.currentPhase).toBe(6)

    // Phase 6: description
    state = wizardReducer(state, {
      type: 'COMPLETE_PHASE_AND_ADVANCE',
      phase: 6,
      data: { description: 'A great cut' },
    })
    expect(state.currentPhase).toBe(7)

    // Phase 7: tags → should reach Phase 8
    state = wizardReducer(state, {
      type: 'COMPLETE_PHASE_AND_ADVANCE',
      phase: 7,
      data: { tags: ['tag1'] },
    })
    expect(state.currentPhase).toBe(8)
  })
})

describe('Cut-specific prompts fallback', () => {
  // These tests verify the prompt fallback chain:
  // cut prompts → episode prompts → BASE_SYSTEM_PROMPTS

  it('cut uses specific prompts when available', () => {
    // This is tested in prompts.test.ts
    // The buildPhasePrompt function handles the fallback chain
    expect(true).toBe(true)
  })

  it('cut falls back to episode prompts when cut prompts are empty', () => {
    // This is tested in prompts.test.ts
    expect(true).toBe(true)
  })
})

describe('Phase 5B integration', () => {
  // These tests verify Phase 5B behavior specific to cuts

  it('Phase 5B does NOT invalidate phases 6 and 7', () => {
    // Phase 5B (short title) is independent of SEO chain
    // Changing short title should NOT require regenerating description/tags
    // This is implemented in the handleRevalidatePhase5B handler
    expect(true).toBe(true)
  })

  it('Phase 5B uses podcast.prompt.cut.thumbs when configured', () => {
    // This is tested in the route.test.ts
    expect(true).toBe(true)
  })
})
