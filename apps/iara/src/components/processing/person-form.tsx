'use client'

import type { UseFormReturn } from 'react-hook-form'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PersonFormProps {
  /** react-hook-form instance */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>
  /** Field path prefix (e.g., 'coHost' or 'guests.0') */
  prefix: string
  /** Label for this person (e.g., 'Co-host', 'Convidado 1') */
  label: string
  /** Whether all fields are required */
  required?: boolean
  /** Whether to show remove button */
  showRemove?: boolean
  /** Callback when remove is clicked */
  onRemove?: () => void
  /** Whether fields are disabled */
  disabled?: boolean
}

/**
 * Reusable form for co-host or guest person data.
 *
 * Fields: name, role, company, linkedinUrl
 */
export function PersonForm({
  form,
  prefix,
  label,
  required = true,
  showRemove = false,
  onRemove,
  disabled = false,
}: PersonFormProps) {
  const { register, formState: { errors } } = form

  // Helper to get nested error
  const getError = (field: string): string | undefined => {
    const parts = `${prefix}.${field}`.split('.')
    let current: Record<string, unknown> | undefined = errors as Record<string, unknown>
    for (const part of parts) {
      if (!current) break
      current = current[part] as Record<string, unknown> | undefined
    }
    return (current as { message?: string } | undefined)?.message
  }

  const nameError = getError('name')
  const roleError = getError('role')
  const companyError = getError('company')
  const linkedinError = getError('linkedin')

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">{label}</h4>
        {showRemove && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="text-xs text-destructive hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Remover
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${prefix}.name`}>
            Nome {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={`${prefix}.name`}
            placeholder="Nome completo"
            disabled={disabled}
            {...register(`${prefix}.name`)}
          />
          {nameError && (
            <p className="text-xs text-destructive">{nameError}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${prefix}.role`}>
            Cargo {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={`${prefix}.role`}
            placeholder="Ex: CEO, CTO, Fundador"
            disabled={disabled}
            {...register(`${prefix}.role`)}
          />
          {roleError && (
            <p className="text-xs text-destructive">{roleError}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${prefix}.company`}>
            Empresa
          </Label>
          <Input
            id={`${prefix}.company`}
            placeholder="Nome da empresa"
            disabled={disabled}
            {...register(`${prefix}.company`)}
          />
          {companyError && (
            <p className="text-xs text-destructive">{companyError}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${prefix}.linkedin`}>
            LinkedIn {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={`${prefix}.linkedin`}
            placeholder="https://linkedin.com/in/..."
            type="url"
            disabled={disabled}
            {...register(`${prefix}.linkedin`)}
          />
          {linkedinError && (
            <p className="text-xs text-destructive">{linkedinError}</p>
          )}
        </div>
      </div>
    </div>
  )
}
