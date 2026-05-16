'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { log } from '@/lib/logger'

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface SaveOptions {
  /**
   * When `true`, re-throws save failures so the caller can react (e.g., block
   * navigation in flush-before-navigate). Defaults to `false` for backward
   * compatibility — consumers calling `save()` in onBlur/onChange handlers
   * without `await` won't trigger unhandled rejections.
   */
  rethrow?: boolean
}

interface UseAutoSaveReturn {
  saveStatus: SaveStatus
  error: Error | null
  save: (options?: SaveOptions) => Promise<void>
  /** Update the internal "last saved value" without triggering a save. Use when syncing from server. */
  resetValue: (value: unknown) => void
}

/**
 * Auto-save hook with debounce.
 *
 * Automatically saves value after a delay (default 1.5s).
 * Provides status indicators for UI feedback.
 *
 * @param value - The value to auto-save
 * @param saveFn - Async function to persist the value
 * @param delay - Debounce delay in milliseconds (default 1500)
 *
 * @example
 * ```tsx
 * const { saveStatus, error, save } = useAutoSave(
 *   name,
 *   async (value) => {
 *     await updatePodcast(podcastId, { name: value })
 *   },
 *   1500
 * )
 * ```
 */
export function useAutoSave<T>(
  value: T,
  saveFn: (value: T) => Promise<void>,
  delay: number = 1500
): UseAutoSaveReturn {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<Error | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedValueRef = useRef<T>(value)
  const isMountedRef = useRef(true)
  const isFirstRender = useRef(true)
  const isSavingRef = useRef(false)

  const performSave = useCallback(
    async (valueToSave: T, options: { rethrow?: boolean } = {}) => {
      // Skip if value hasn't changed from last saved value
      // Use JSON.stringify for deep comparison of objects
      const currentJson = JSON.stringify(valueToSave)
      const lastJson = JSON.stringify(lastSavedValueRef.current)
      if (currentJson === lastJson) {
        // Value unchanged, reset pending status if applicable
        if (isMountedRef.current) {
          setSaveStatus('idle')
        }
        return
      }

      // Mark as saving to prevent useEffect from setting pending
      isSavingRef.current = true
      setSaveStatus('saving')
      setError(null)

      try {
        await saveFn(valueToSave)
        if (isMountedRef.current) {
          lastSavedValueRef.current = valueToSave
          setSaveStatus('saved')
          isSavingRef.current = false
          // Reset to idle after 2s
          setTimeout(() => {
            if (isMountedRef.current) {
              setSaveStatus('idle')
            }
          }, 2000)
        }
      } catch (err) {
        isSavingRef.current = false
        const saveError = err instanceof Error ? err : new Error(String(err))
        if (isMountedRef.current) {
          setError(saveError)
          setSaveStatus('error')
          log('ERROR', 'Auto-save failed', { error: saveError.message })
        }
        // For explicit flush callers (flush-before-navigate pattern), re-throw
        // so they can block navigation. The debounced auto-save path keeps the
        // original swallow behavior (state already reflects the error).
        if (options.rethrow) {
          throw saveError
        }
      }
    },
    [saveFn]
  )

  // Debounced save on value change
  useEffect(() => {
    // Skip first render to avoid saving initial value
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Check if value has changed from last saved value
    const currentJson = JSON.stringify(value)
    const lastJson = JSON.stringify(lastSavedValueRef.current)
    const hasChanges = currentJson !== lastJson

    // Show pending status immediately when there are unsaved changes
    // but only if not currently saving.
    // Note: This intentional setState in effect provides immediate UI feedback
    // when user types, before the debounce timer completes.
    if (hasChanges && !isSavingRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaveStatus('pending')
    }

    timeoutRef.current = setTimeout(() => {
      performSave(value)
    }, delay)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [value, delay, performSave])

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Force immediate save (awaitable for flush-before-navigate pattern).
  // Pass `{ rethrow: true }` to surface failures to the caller (e.g., to block
  // navigation). Without it, behaves like the debounced path: state reflects the
  // error (saveStatus='error', saveError set) but the Promise resolves OK.
  const save = useCallback(async (options?: SaveOptions) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    await performSave(value, { rethrow: options?.rethrow ?? false })
  }, [value, performSave])

  const resetValue = useCallback((newValue: unknown) => {
    lastSavedValueRef.current = newValue as T
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setSaveStatus('idle')
  }, [])

  return { saveStatus, error, save, resetValue }
}
