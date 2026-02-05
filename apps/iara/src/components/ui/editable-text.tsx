'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2Icon, CheckIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Input } from './input'

type EditableTextState = 'normal' | 'editing' | 'saving' | 'saved'

interface EditableTextProps {
  /** Current value to display/edit */
  value: string
  /** Callback when value is saved. Returns promise for async save. */
  onSave: (newValue: string) => Promise<void>
  /** Additional class names for the container */
  className?: string
  /** Additional class names for the text display */
  textClassName?: string
  /** Placeholder when value is empty */
  placeholder?: string
  /** If true, disables editing */
  disabled?: boolean
}

/**
 * Editable text component with inline editing support.
 *
 * States:
 * - normal: Displays text, click to edit
 * - editing: Shows input field
 * - saving: Shows spinner while saving
 * - saved: Shows checkmark briefly after save
 *
 * Keyboard:
 * - Enter: Save changes
 * - Escape: Cancel changes
 *
 * @example
 * <EditableText
 *   value={chapter.title}
 *   onSave={async (newValue) => await saveChapter({ ...chapter, title: newValue })}
 *   className="flex-1"
 * />
 */
export function EditableText({
  value,
  onSave,
  className,
  textClassName,
  placeholder = 'Clique para editar',
  disabled = false,
}: EditableTextProps) {
  const [state, setState] = useState<EditableTextState>('normal')
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Update editValue when value prop changes (e.g., from external update)
  useEffect(() => {
    if (state === 'normal') {
      setEditValue(value)
    }
  }, [value, state])

  // Focus input when entering edit mode
  useEffect(() => {
    if (state === 'editing' && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [state])

  const handleClick = useCallback(() => {
    if (disabled || state !== 'normal') return
    setState('editing')
  }, [disabled, state])

  const handleSave = useCallback(async () => {
    const trimmedValue = editValue.trim()

    // Don't save if empty or unchanged
    if (!trimmedValue || trimmedValue === value) {
      setEditValue(value)
      setState('normal')
      return
    }

    setState('saving')
    try {
      await onSave(trimmedValue)
      setState('saved')
      // Show checkmark briefly then return to normal
      setTimeout(() => setState('normal'), 1000)
    } catch {
      // On error, revert to original value
      setEditValue(value)
      setState('normal')
    }
  }, [editValue, value, onSave])

  const handleCancel = useCallback(() => {
    setEditValue(value)
    setState('normal')
  }, [value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancel()
      }
    },
    [handleSave, handleCancel]
  )

  const handleBlur = useCallback(() => {
    // Small delay to allow click on other elements
    setTimeout(() => {
      if (state === 'editing') {
        handleSave()
      }
    }, 100)
  }, [state, handleSave])

  // Render based on state
  if (state === 'editing' || state === 'saving') {
    return (
      <div className={cn('relative flex items-center gap-2', className)}>
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={state === 'saving'}
          className={cn(
            'h-8 text-sm',
            state === 'editing' && 'ring-2 ring-primary bg-muted',
            state === 'saving' && 'opacity-70'
          )}
        />
        {state === 'saving' && (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground shrink-0" />
        )}
      </div>
    )
  }

  return (
    <div className={cn('relative flex items-center gap-2', className)}>
      <span
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
        className={cn(
          'text-sm cursor-text transition-all rounded px-1 -mx-1',
          !disabled && 'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-muted',
          disabled && 'cursor-default',
          state === 'saved' && 'bg-green-100 dark:bg-green-900/30',
          !value && 'text-muted-foreground italic',
          textClassName
        )}
      >
        {value || placeholder}
      </span>
      {state === 'saved' && (
        <CheckIcon className="size-4 text-green-600 dark:text-green-400 shrink-0 animate-in fade-in duration-200" />
      )}
    </div>
  )
}
