import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, renderHook } from '@/test-utils'

// Mock the logger
vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { useAutoSave } from './use-auto-save'
import { log } from '@/lib/logger'

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with idle status', () => {
    const saveFn = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutoSave('initial', saveFn))

    expect(result.current.saveStatus).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('does not save on first render', () => {
    const saveFn = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useAutoSave('initial', saveFn))

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(saveFn).not.toHaveBeenCalled()
  })

  it('debounces save by specified delay', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderHook(
      ({ value }) => useAutoSave(value, saveFn, 1500),
      { initialProps: { value: 'initial' } }
    )

    // Change value
    rerender({ value: 'updated' })

    // Not saved yet (debounce)
    expect(saveFn).not.toHaveBeenCalled()

    // Advance time by less than delay
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(saveFn).not.toHaveBeenCalled()

    // Advance time to complete delay
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(saveFn).toHaveBeenCalledWith('updated')
  })

  it('shows pending status immediately when value changes', () => {
    const saveFn = vi.fn().mockResolvedValue(undefined)

    const { result, rerender } = renderHook(
      ({ value }) => useAutoSave(value, saveFn, 1500),
      { initialProps: { value: 'initial' } }
    )

    // Change value
    rerender({ value: 'updated' })

    // Should show pending immediately (before debounce completes)
    expect(result.current.saveStatus).toBe('pending')
  })

  it('shows saving status during save', async () => {
    let resolvePromise: () => void
    const saveFn = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve
        })
    )

    const { result, rerender } = renderHook(
      ({ value }) => useAutoSave(value, saveFn, 1500),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })

    // Should be pending first
    expect(result.current.saveStatus).toBe('pending')

    await act(async () => {
      vi.advanceTimersByTime(1500)
      await Promise.resolve()
    })

    expect(result.current.saveStatus).toBe('saving')

    await act(async () => {
      resolvePromise!()
      await Promise.resolve()
    })

    expect(result.current.saveStatus).toBe('saved')
  })

  it('resets to idle after 2s of saved status', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined)

    const { result, rerender } = renderHook(
      ({ value }) => useAutoSave(value, saveFn, 1500),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })

    await act(async () => {
      vi.advanceTimersByTime(1500)
      await Promise.resolve()
    })

    expect(result.current.saveStatus).toBe('saved')

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.saveStatus).toBe('idle')
  })

  it('shows error status on save failure', async () => {
    const error = new Error('Save failed')
    const saveFn = vi.fn().mockRejectedValue(error)

    const { result, rerender } = renderHook(
      ({ value }) => useAutoSave(value, saveFn, 1500),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })

    // Advance timers to trigger debounced save
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    // Wait for the rejected promise to settle
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(result.current.saveStatus).toBe('error')
    expect(result.current.error).toEqual(error)
    expect(log).toHaveBeenCalledWith('ERROR', 'Auto-save failed', { error: error.message })
  })

  it('cancels previous debounce on rapid changes', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined)

    const { rerender } = renderHook(
      ({ value }) => useAutoSave(value, saveFn, 1500),
      { initialProps: { value: 'initial' } }
    )

    // Rapid changes
    rerender({ value: 'change1' })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    rerender({ value: 'change2' })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    rerender({ value: 'change3' })

    // Wait for debounce to complete
    await act(async () => {
      vi.advanceTimersByTime(1500)
      await Promise.resolve()
    })

    // Only the last value should be saved
    expect(saveFn).toHaveBeenCalledTimes(1)
    expect(saveFn).toHaveBeenCalledWith('change3')
  })

  it('does not save if value unchanged from last saved', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined)

    const { rerender } = renderHook(
      ({ value }) => useAutoSave(value, saveFn, 1500),
      { initialProps: { value: 'initial' } }
    )

    // First change
    rerender({ value: 'updated' })
    await act(async () => {
      vi.advanceTimersByTime(1500)
      await Promise.resolve()
    })

    expect(saveFn).toHaveBeenCalledTimes(1)

    // Reset saved status
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Change back and forth to same value
    rerender({ value: 'other' })
    rerender({ value: 'updated' }) // Back to already saved value

    await act(async () => {
      vi.advanceTimersByTime(1500)
      await Promise.resolve()
    })

    // Should still be only 1 call because 'updated' was already saved
    expect(saveFn).toHaveBeenCalledTimes(1)
  })

  it('resetValue prevents unnecessary save on server sync', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined)

    const { result, rerender } = renderHook(
      ({ value }) => useAutoSave(value, saveFn, 1500),
      { initialProps: { value: '' } }
    )

    // Simulate server value arriving and resetting
    act(() => {
      result.current.resetValue('server content')
    })

    // Update local state to match server value
    rerender({ value: 'server content' })

    // Wait for debounce
    await act(async () => {
      vi.advanceTimersByTime(1500)
      await Promise.resolve()
    })

    // Should NOT have saved because resetValue set lastSavedValue to 'server content'
    expect(saveFn).not.toHaveBeenCalled()
    expect(result.current.saveStatus).toBe('idle')
  })

  it('force saves immediately when save() is called', async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined)

    const { result, rerender } = renderHook(
      ({ value }) => useAutoSave(value, saveFn, 1500),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })

    // Force save immediately without waiting for debounce
    await act(async () => {
      result.current.save()
      await Promise.resolve()
    })

    expect(saveFn).toHaveBeenCalledWith('updated')
  })
})
