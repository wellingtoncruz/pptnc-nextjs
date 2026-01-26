'use client'

import { useState, useEffect } from 'react'
import { z } from 'zod'

import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useAutoSave } from '@/hooks/use-auto-save'
import { log } from '@/lib/logger'
import { MAX_PROMPT_LENGTH } from '@/lib/schemas/podcast'
import { SaveStatusIndicator } from './save-status-indicator'
import type { PromptField } from '@/types/podcast'

/**
 * Client-side validation schema for a single field (description or expectedOutput).
 */
const FieldSchema = z.string().max(MAX_PROMPT_LENGTH, 'Campo deve ter no máximo 10000 caracteres')

interface PromptFieldEditorProps {
  fieldKey: string
  label: string
  initialValue: PromptField
  onSave: (value: PromptField) => Promise<void>
}

/**
 * Editor component for a PromptField with description and expectedOutput.
 *
 * Features:
 * - Two textareas: description and expectedOutput
 * - Character counter for each (X / 10000)
 * - Auto-save with 1.5s debounce
 * - Client-side Zod validation
 * - Save status indicators
 */
export function PromptFieldEditor({ fieldKey, label, initialValue, onSave }: PromptFieldEditorProps) {
  const [description, setDescription] = useState(initialValue.description)
  const [expectedOutput, setExpectedOutput] = useState(initialValue.expectedOutput)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Sync state with initialValue when it changes (e.g., after refetch)
  // This is intentional - we need to update local state when props change from server
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setDescription(initialValue.description)
    setExpectedOutput(initialValue.expectedOutput)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialValue.description, initialValue.expectedOutput])

  // Combine both fields for auto-save tracking
  const combinedValue = JSON.stringify({ description, expectedOutput })

  const { saveStatus, save } = useAutoSave(
    combinedValue,
    async () => {
      setValidationError(null)

      // Validate description
      const descResult = FieldSchema.safeParse(description)
      if (!descResult.success) {
        const message = descResult.error.issues[0]?.message || 'Descrição inválida'
        setValidationError(message)
        return
      }

      // Validate expectedOutput
      const outputResult = FieldSchema.safeParse(expectedOutput)
      if (!outputResult.success) {
        const message = outputResult.error.issues[0]?.message || 'Saída esperada inválida'
        setValidationError(message)
        return
      }

      try {
        await onSave({ description, expectedOutput })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar'
        setValidationError(message)
        log('ERROR', 'Failed to save prompt field', { fieldKey, error: message })
        // Don't re-throw - error is already displayed to user via validationError
        // Re-throwing would crash the component tree without an error boundary
      }
    },
    1500
  )

  const isDescOverLimit = description.length > MAX_PROMPT_LENGTH
  const isOutputOverLimit = expectedOutput.length > MAX_PROMPT_LENGTH

  // IDs for aria-describedby
  const descCounterId = `${fieldKey}-description-counter`
  const outputCounterId = `${fieldKey}-output-counter`
  const errorId = `${fieldKey}-error`

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="font-medium">{label}</h4>

      {/* Description field */}
      <div className="space-y-2">
        <Label htmlFor={`${fieldKey}-description`}>Descrição do Prompt</Label>
        <Textarea
          id={`${fieldKey}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => save()}
          placeholder="Descreva o que o LLM deve fazer..."
          className="min-h-[100px] resize-y"
          aria-invalid={isDescOverLimit}
          aria-describedby={`${descCounterId}${validationError ? ` ${errorId}` : ''}`}
        />
        <div className="flex items-center justify-end text-xs">
          <span
            id={descCounterId}
            className={isDescOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}
          >
            {description.length} / {MAX_PROMPT_LENGTH}
          </span>
        </div>
      </div>

      {/* Expected Output field */}
      <div className="space-y-2">
        <Label htmlFor={`${fieldKey}-output`}>Saída Esperada</Label>
        <Textarea
          id={`${fieldKey}-output`}
          value={expectedOutput}
          onChange={(e) => setExpectedOutput(e.target.value)}
          onBlur={() => save()}
          placeholder="Descreva o formato e estrutura esperada da resposta..."
          className="min-h-[100px] resize-y"
          aria-invalid={isOutputOverLimit}
          aria-describedby={`${outputCounterId}${validationError ? ` ${errorId}` : ''}`}
        />
        <div className="flex items-center justify-end text-xs">
          <span
            id={outputCounterId}
            className={isOutputOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}
          >
            {expectedOutput.length} / {MAX_PROMPT_LENGTH}
          </span>
        </div>
      </div>

      {/* Status indicators */}
      {validationError ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {validationError}
        </p>
      ) : (
        <SaveStatusIndicator status={saveStatus} />
      )}
    </div>
  )
}
