/**
 * Tests for the useWizard localStorage schema gate (TD-7 / Epic 25, Story 25.6).
 *
 * TD-7 changed the persisted wizard-state shape from numeric phases
 * (currentPhase: 1..8, phases keyed 1..8) to semantic kebab IDs. State written
 * by a pre-refactor build must be discarded on load — otherwise the HYDRATE
 * reducer iterates the kebab TRACKED_PHASE_IDS over a numeric-keyed `phases`
 * record and crashes ("Cannot read properties of undefined (reading 'status')").
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useWizard } from './use-wizard'
import { isWizardPhaseId, TRACKED_PHASE_IDS } from '@/lib/wizard'
import type { VideoDataForSync } from '@/lib/wizard'

const storageKey = (videoId: string) => `wizard-state-${videoId}`

const kebabPhases = () =>
  Object.fromEntries(
    TRACKED_PHASE_IDS.map((id) => [id, { status: 'pending', data: null, error: null }])
  )

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('useWizard — localStorage schema gate (TD-7 / Story 25.6)', () => {
  it('discards pre-refactor numeric-shaped state without crashing (regression)', () => {
    // Shape persisted by a pre-TD-7 build: numeric currentPhase + numeric phase
    // keys, and NO schemaVersion.
    const stale = {
      videoId: 'vid-1',
      currentPhase: 5,
      phases: {
        1: { status: 'completed', data: null, error: null },
        2: { status: 'completed', data: null, error: null },
        3: { status: 'completed', data: null, error: null },
        4: { status: 'completed', data: null, error: null },
        5: { status: 'pending', data: null, error: null },
        6: { status: 'pending', data: null, error: null },
        7: { status: 'pending', data: null, error: null },
        8: { status: 'pending', data: null, error: null },
      },
    }
    localStorage.setItem(storageKey('vid-1'), JSON.stringify(stale))

    const videoData: VideoDataForSync = { videoType: 'episode' }

    // Before the fix this threw in wizardReducer during initialization.
    const { result } = renderHook(() => useWizard('vid-1', videoData))

    // Falls back to a valid kebab-shaped state (re-hydrated from video data).
    expect(isWizardPhaseId(result.current.currentPhase)).toBe(true)
    for (const id of TRACKED_PHASE_IDS) {
      expect(result.current.state.phases[id]).toBeDefined()
    }
  })

  it('discards well-formed state that is missing the schemaVersion', () => {
    const noVersion = {
      videoId: 'vid-2',
      videoType: 'episode',
      currentPhase: 'tags',
      phases: kebabPhases(),
    }
    localStorage.setItem(storageKey('vid-2'), JSON.stringify(noVersion))

    const { result } = renderHook(() => useWizard('vid-2'))

    // Discarded → fresh episode state starts at 'critique', not the stored 'tags'.
    expect(result.current.currentPhase).toBe('critique')
  })

  it('restores a valid current-version state', () => {
    const current = {
      videoId: 'vid-3',
      videoType: 'episode',
      currentPhase: 'tags',
      phases: kebabPhases(),
      schemaVersion: 2,
    }
    localStorage.setItem(storageKey('vid-3'), JSON.stringify(current))

    const { result } = renderHook(() => useWizard('vid-3'))

    expect(result.current.currentPhase).toBe('tags')
  })

  it('persists state tagged with the current schemaVersion and kebab keys', () => {
    renderHook(() => useWizard('vid-4'))

    const raw = localStorage.getItem(storageKey('vid-4'))
    expect(raw).not.toBeNull()

    const parsed = JSON.parse(raw!)
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.phases.critique).toBeDefined()
    expect(parsed.phases['1']).toBeUndefined()
  })
})

describe('useWizard — reinitializeFromVideo (Epic 25 / Story 25.9 — Vídeo Avulso)', () => {
  it('rebuilds the flow to skip parent when standalone is enabled', () => {
    // A cut with no parent starts at the parent-selection phase.
    const { result } = renderHook(() => useWizard('vid-sa', { videoType: 'cut' }))
    expect(result.current.currentPhase).toBe('parent')

    // Enabling standalone clears the parent and removes the parent phase, so the
    // flow must start at 'title' (a plain re-hydration could not move it).
    act(() => {
      result.current.reinitializeFromVideo({
        videoType: 'cut',
        standalone: true,
        parentEpisodeId: '',
      })
    })

    expect(result.current.currentPhase).toBe('title')
  })

  it('restores the parent phase when standalone is disabled and there is no parent', () => {
    const { result } = renderHook(() =>
      useWizard('vid-sb', { videoType: 'reel', standalone: true })
    )
    expect(result.current.currentPhase).toBe('title')

    act(() => {
      result.current.reinitializeFromVideo({
        videoType: 'reel',
        standalone: false,
        parentEpisodeId: '',
      })
    })

    expect(result.current.currentPhase).toBe('parent')
  })
})
