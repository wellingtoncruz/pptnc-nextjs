'use client'

interface SaveStatusIndicatorProps {
  status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  /** Optional override label when the parent has extra work in flight (e.g., scraping). */
  busyLabel?: string
}

/**
 * Displays auto-save status indicator.
 *
 * Used by PromptEditor, DurationSettingsForm and Phase 1 to show save progress.
 * Wraps the live region in `role="status"` + `aria-live="polite"` so assistive
 * tech announces state changes (Story 24.6).
 *
 * Status meanings:
 * - idle: No changes, nothing to show
 * - pending: Changes made, waiting for debounce before save
 * - saving: Save in progress
 * - saved: Save completed successfully
 * - error: Save failed (handled separately by parent component)
 *
 * `busyLabel` overrides the visible text while the parent has extra async work
 * (e.g., "Enriquecendo dados do LinkedIn..." in Phase 1). The polite live region
 * still announces transitions.
 */
export function SaveStatusIndicator({ status, busyLabel }: SaveStatusIndicatorProps) {
  let content: { text: string; className: string } | null = null
  if (busyLabel) {
    content = { text: busyLabel, className: 'text-xs text-muted-foreground' }
  } else if (status === 'pending') {
    content = { text: 'Alterações pendentes...', className: 'text-xs text-amber-500' }
  } else if (status === 'saving') {
    content = { text: 'Salvando...', className: 'text-xs text-muted-foreground' }
  } else if (status === 'saved') {
    content = { text: 'Salvo', className: 'text-xs text-green-500' }
  }

  if (!content) return null

  return (
    <p role="status" aria-live="polite" className={content.className}>
      {content.text}
    </p>
  )
}
