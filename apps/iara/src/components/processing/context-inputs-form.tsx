'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDownIcon, PlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PersonForm } from './person-form'
import { EpisodeContextFormSchema } from '@/lib/schemas/video'
import type { EpisodeContextFormData, Guest } from '@/types/video'

interface ContextInputsFormProps {
  /** Initial values for editing existing context */
  defaultValues?: Partial<EpisodeContextFormData>
  /** Callback when form is submitted successfully */
  onSubmit: (data: EpisodeContextFormData) => void
  /** Callback when cancel is clicked */
  onCancel: () => void
  /** Whether the form is submitting */
  isSubmitting?: boolean
}

const emptyGuest: Guest = {
  name: '',
  role: '',
  company: '',
  linkedin: '',
}

/**
 * Checks if a guest object has any meaningful data filled in.
 */
function hasGuestData(guest: Guest | undefined): boolean {
  if (!guest) return false
  return Boolean(guest.name || guest.role || guest.company || guest.linkedin)
}

/**
 * Form for episode context inputs (theme, co-host, guests).
 *
 * - Theme is required
 * - Co-host is optional (collapsible accordion)
 * - 1-3 guests are required
 */
export function ContextInputsForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: ContextInputsFormProps) {
  // Memoize initial values to avoid unnecessary resets
  const initialValues = useMemo(() => ({
    theme: defaultValues?.theme ?? '',
    hasCoHost: defaultValues?.hasCoHost ?? false,
    coHost: defaultValues?.coHost,
    guests: defaultValues?.guests ?? [{ ...emptyGuest }],
  }), [defaultValues?.theme, defaultValues?.hasCoHost, defaultValues?.coHost, defaultValues?.guests])

  const form = useForm<EpisodeContextFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(EpisodeContextFormSchema) as any,
    defaultValues: initialValues,
  })

  const { register, formState: { errors }, handleSubmit, control, watch, reset, setValue } = form

  // Reset form when defaultValues change (e.g., when component remounts with new data)
  useEffect(() => {
    reset(initialValues)
  }, [initialValues, reset])

  const { fields: guestFields, append, remove } = useFieldArray({
    control,
    name: 'guests',
  })

  const coHost = watch('coHost')
  const hasCoHostData = hasGuestData(coHost)
  const [coHostOpen, setCoHostOpen] = useState(hasCoHostData)

  // Sync hasCoHost field with actual coHost data presence
  useEffect(() => {
    setValue('hasCoHost', hasCoHostData)
  }, [hasCoHostData, setValue])

  // Open co-host section if it has data on mount
  useEffect(() => {
    if (hasCoHostData) setCoHostOpen(true)
  }, [hasCoHostData])

  const handleAddGuest = () => {
    if (guestFields.length < 3) {
      append({ ...emptyGuest })
    }
  }

  const handleRemoveGuest = (index: number) => {
    if (guestFields.length > 1) {
      remove(index)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Theme */}
      <div className="space-y-2">
        <Label htmlFor="theme">
          Tema do Episódio <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="theme"
          placeholder="Descreva o tema principal do episódio. Ex: Como a IA está transformando o mercado de trabalho..."
          rows={3}
          {...register('theme')}
        />
        {errors.theme && (
          <p className="text-xs text-destructive">{errors.theme.message}</p>
        )}
      </div>

      {/* Co-host (optional, collapsible) */}
      <div className="border rounded-lg">
        <button
          type="button"
          onClick={() => setCoHostOpen(!coHostOpen)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-sm font-medium">
            Co-host <span className="text-muted-foreground font-normal">(opcional)</span>
          </span>
          <ChevronDownIcon
            className={`size-4 text-muted-foreground transition-transform duration-200 ${coHostOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {coHostOpen && (
          <div className="px-4 pb-4">
            <PersonForm
              form={form}
              prefix="coHost"
              label="Dados do Co-host"
              required={false}
            />
          </div>
        )}
      </div>

      {/* Guests (1-3 required) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>
            Convidados <span className="text-destructive">*</span>
            <span className="text-muted-foreground text-xs ml-2">
              ({guestFields.length}/3)
            </span>
          </Label>
          {guestFields.length < 3 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddGuest}
            >
              <PlusIcon className="size-4 mr-1" />
              Adicionar
            </Button>
          )}
        </div>

        {errors.guests && typeof errors.guests.message === 'string' && (
          <p className="text-xs text-destructive">{errors.guests.message}</p>
        )}

        <div className="space-y-3">
          {guestFields.map((field, index) => (
            <PersonForm
              key={field.id}
              form={form}
              prefix={`guests.${index}`}
              label={`Convidado ${index + 1}`}
              required={true}
              showRemove={guestFields.length > 1}
              onRemove={() => handleRemoveGuest(index)}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando...' : 'Iniciar Processamento'}
        </Button>
      </div>
    </form>
  )
}
