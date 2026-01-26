'use client'

import { useState, useEffect } from 'react'
import { z } from 'zod'

import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAutoSave } from '@/hooks/use-auto-save'
import { log } from '@/lib/logger'
import {
  MAX_ROLE_LENGTH,
  MAX_OBJECTIVE_LENGTH,
  MAX_RESUME_LENGTH,
} from '@/lib/schemas/podcast'
import { SaveStatusIndicator } from './save-status-indicator'
import type { Persona } from '@/types/podcast'

/**
 * Client-side validation schemas using shared constants.
 */
const RoleSchema = z.string().max(MAX_ROLE_LENGTH, `Papel deve ter no máximo ${MAX_ROLE_LENGTH} caracteres`)
const ObjectiveSchema = z.string().max(MAX_OBJECTIVE_LENGTH, `Objetivo deve ter no máximo ${MAX_OBJECTIVE_LENGTH} caracteres`)
const ResumeSchema = z.string().max(MAX_RESUME_LENGTH, `Resumo deve ter no máximo ${MAX_RESUME_LENGTH} caracteres`)

interface PersonaEditorProps {
  personaKey: 'critic' | 'writer'
  label: string
  initialValue: Persona
  onSave: (value: Persona) => Promise<void>
}

/**
 * Editor component for a Persona with role, objective, and resume fields.
 *
 * Features:
 * - Input for role (1000 chars max)
 * - Textarea for objective (2000 chars max)
 * - Textarea for resume (5000 chars max)
 * - Character counters for each field
 * - Auto-save with 1.5s debounce
 * - Client-side Zod validation
 * - Save status indicators
 */
export function PersonaEditor({ personaKey, label, initialValue, onSave }: PersonaEditorProps) {
  const [role, setRole] = useState(initialValue.role)
  const [objective, setObjective] = useState(initialValue.objective)
  const [resume, setResume] = useState(initialValue.resume)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Sync state with initialValue when it changes (e.g., after refetch)
  // This is intentional - we need to update local state when props change from server
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setRole(initialValue.role)
    setObjective(initialValue.objective)
    setResume(initialValue.resume)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialValue.role, initialValue.objective, initialValue.resume])

  // Combine all fields for auto-save tracking
  const combinedValue = JSON.stringify({ role, objective, resume })

  const { saveStatus, save } = useAutoSave(
    combinedValue,
    async () => {
      setValidationError(null)

      // Validate role
      const roleResult = RoleSchema.safeParse(role)
      if (!roleResult.success) {
        setValidationError(roleResult.error.issues[0]?.message || 'Papel inválido')
        return
      }

      // Validate objective
      const objectiveResult = ObjectiveSchema.safeParse(objective)
      if (!objectiveResult.success) {
        setValidationError(objectiveResult.error.issues[0]?.message || 'Objetivo inválido')
        return
      }

      // Validate resume
      const resumeResult = ResumeSchema.safeParse(resume)
      if (!resumeResult.success) {
        setValidationError(resumeResult.error.issues[0]?.message || 'Resumo inválido')
        return
      }

      try {
        await onSave({ role, objective, resume })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar'
        setValidationError(message)
        log('ERROR', 'Failed to save persona', { personaKey, error: message })
        // Don't re-throw - error is already displayed to user via validationError
        // Re-throwing would crash the component tree without an error boundary
      }
    },
    1500
  )

  const isRoleOverLimit = role.length > MAX_ROLE_LENGTH
  const isObjectiveOverLimit = objective.length > MAX_OBJECTIVE_LENGTH
  const isResumeOverLimit = resume.length > MAX_RESUME_LENGTH

  // IDs for aria-describedby
  const roleCounterId = `${personaKey}-role-counter`
  const objectiveCounterId = `${personaKey}-objective-counter`
  const resumeCounterId = `${personaKey}-resume-counter`
  const errorId = `${personaKey}-error`

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="font-medium">{label}</h4>

      {/* Role field */}
      <div className="space-y-2">
        <Label htmlFor={`${personaKey}-role`}>Papel</Label>
        <Input
          id={`${personaKey}-role`}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          onBlur={() => save()}
          placeholder="Ex: Crítico especialista em podcasts"
          aria-invalid={isRoleOverLimit}
          aria-describedby={`${roleCounterId}${validationError ? ` ${errorId}` : ''}`}
        />
        <div className="flex items-center justify-end text-xs">
          <span
            id={roleCounterId}
            className={isRoleOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}
          >
            {role.length} / {MAX_ROLE_LENGTH}
          </span>
        </div>
      </div>

      {/* Objective field */}
      <div className="space-y-2">
        <Label htmlFor={`${personaKey}-objective`}>Objetivo</Label>
        <Textarea
          id={`${personaKey}-objective`}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          onBlur={() => save()}
          placeholder="Descreva o objetivo principal desta persona..."
          className="min-h-[80px] resize-y"
          aria-invalid={isObjectiveOverLimit}
          aria-describedby={`${objectiveCounterId}${validationError ? ` ${errorId}` : ''}`}
        />
        <div className="flex items-center justify-end text-xs">
          <span
            id={objectiveCounterId}
            className={isObjectiveOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}
          >
            {objective.length} / {MAX_OBJECTIVE_LENGTH}
          </span>
        </div>
      </div>

      {/* Resume field */}
      <div className="space-y-2">
        <Label htmlFor={`${personaKey}-resume`}>Resumo / Contexto</Label>
        <Textarea
          id={`${personaKey}-resume`}
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          onBlur={() => save()}
          placeholder="Forneça contexto adicional, instruções especiais, ou informações de background..."
          className="min-h-[120px] resize-y"
          aria-invalid={isResumeOverLimit}
          aria-describedby={`${resumeCounterId}${validationError ? ` ${errorId}` : ''}`}
        />
        <div className="flex items-center justify-end text-xs">
          <span
            id={resumeCounterId}
            className={isResumeOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}
          >
            {resume.length} / {MAX_RESUME_LENGTH}
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
