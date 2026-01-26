'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { log } from '@/lib/logger'

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface UseAutoSaveReturn {
  saveStatus: SaveStatus
  error: Error | null
  save: () => void
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
    async (valueToSave: T) => {
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
        if (isMountedRef.current) {
          const saveError = err instanceof Error ? err : new Error(String(err))
          setError(saveError)
          setSaveStatus('error')
          log('ERROR', 'Auto-save failed', { error: saveError.message })
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

  // Force immediate save
  const save = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    performSave(value)
  }, [value, performSave])

  return { saveStatus, error, save }
}
