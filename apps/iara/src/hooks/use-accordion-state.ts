/**
 * Hook for persisting accordion state in localStorage.
 *
 * Provides SSR-safe state management for accordion sections with
 * automatic persistence to localStorage.
 *
 * @see docs/stories/8-2-secoes-colapsaveis.md
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Hook that manages accordion open/close state with localStorage persistence.
 *
 * Uses SSR-safe pattern: starts with defaultValue, then syncs from localStorage after mount.
 *
 * @param storageKey - The localStorage key for persisting state
 * @param defaultValue - Default array of open section IDs (used on first visit)
 * @returns Tuple of [openSections, setOpenSections] similar to useState
 *
 * @example
 * ```tsx
 * const [openSections, setOpenSections] = useAccordionState(
 *   'settings-accordion-state',
 *   ['podcast', 'duration', 'personas', 'prompts']
 * )
 *
 * <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
 *   ...
 * </Accordion>
 * ```
 */
export function useAccordionState(
  storageKey: string,
  defaultValue: string[]
): [string[], (value: string[]) => void] {
  const [mounted, setMounted] = useState(false)
  const [value, setValue] = useState<string[]>(defaultValue)

  // Load from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Validate that parsed value is an array of strings
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
          setValue(parsed)
        }
      }
    } catch {
      // Ignore parse errors, keep default
    }
    setMounted(true)
  }, [storageKey])

  // Persist to localStorage when value changes (after mount)
  const setValueAndPersist = useCallback(
    (newValue: string[]) => {
      setValue(newValue)
      if (mounted) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(newValue))
        } catch {
          // Ignore storage errors (quota exceeded, etc.)
        }
      }
    },
    [storageKey, mounted]
  )

  return [value, setValueAndPersist]
}
