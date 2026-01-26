'use client'

interface SaveStatusIndicatorProps {
  status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
}

/**
 * Displays auto-save status indicator.
 *
 * Used by PromptEditor and DurationSettingsForm to show
 * save progress to the user.
 *
 * Status meanings:
 * - idle: No changes, nothing to show
 * - pending: Changes made, waiting for debounce before save
 * - saving: Save in progress
 * - saved: Save completed successfully
 * - error: Save failed (handled separately by parent component)
 */
export function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
  if (status === 'pending') {
    return <p className="text-xs text-amber-500">Alterações pendentes...</p>
  }
  if (status === 'saving') {
    return <p className="text-xs text-muted-foreground">Salvando...</p>
  }
  if (status === 'saved') {
    return <p className="text-xs text-green-500">Salvo</p>
  }
  return null
}
