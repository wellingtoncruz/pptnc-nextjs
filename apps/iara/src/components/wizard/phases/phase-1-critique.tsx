'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { PlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { PersonForm } from '@/components/processing/person-form'
import { SaveStatusIndicator } from '@/components/settings/save-status-indicator'
import { cn } from '@/lib/utils'
import { log } from '@/lib/logger'
import { useAutoSave } from '@/hooks/use-auto-save'
import { EpisodeContextFormSchema } from '@/lib/schemas/video'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video, Guest, EpisodeContextFormData } from '@/types/video'
import type { Phase1Response } from '@/lib/llm'

interface Phase1CritiqueProps {
  wizard: UseWizardReturn
  video: Video
  /** Critique result from orchestrator (may be null while processing) */
  critique: Phase1Response | null
  className?: string
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
 * Checks if a guest object has ALL required fields filled in.
 * Used to filter guests before sending to API (which validates with GuestSchema).
 * Required: name, role, linkedin. Optional: company, photo.
 */
function isGuestComplete(guest: Guest | undefined): boolean {
  if (!guest) return false
  return Boolean(
    guest.name?.trim() &&
    guest.role?.trim() &&
    guest.linkedin?.trim()
  )
}

/**
 * Phase 1: Input Initial and Critique (Tipo 2 - Immutable)
 *
 * Per processamento_video.md:
 * - "Área de iteratividade: Vai trazer o seu inputs iniciais para preenchimento
 *    pelo produtor (tema geral do episódio, co-host e convidados)."
 *
 * This component:
 * 1. Receives critique from orchestrator (processing is done there)
 * 2. Shows inputs for episode context (theme, co-host, guests) with auto-save
 * 3. Displays critique when available (passed as prop)
 *
 * As a Type 2 (Immutable) phase, the critique cannot be reprocessed after completion.
 */
export function Phase1Critique({
  wizard,
  video,
  critique,
  className,
}: Phase1CritiqueProps) {
  const phaseState = wizard.state.phases[1]
  const hasError = phaseState.status === 'error'

  // Extract co-host from guests array (first guest if they have "host" in role)
  const existingCoHost = useMemo(() => {
    const firstGuest = video.guests?.[0]
    if (firstGuest?.role?.toLowerCase().includes('host')) {
      return firstGuest
    }
    return undefined
  }, [video.guests])

  // Extract regular guests (exclude co-host)
  const existingGuests = useMemo(() => {
    if (!video.guests) return [{ ...emptyGuest }]
    const guests = existingCoHost ? video.guests.slice(1) : video.guests
    return guests.length > 0 ? guests : [{ ...emptyGuest }]
  }, [video.guests, existingCoHost])

  // Form for context inputs
  const initialValues = useMemo(() => ({
    theme: video.theme ?? '',
    hasCoHost: hasGuestData(existingCoHost),
    coHost: existingCoHost,
    guests: existingGuests,
  }), [video.theme, existingCoHost, existingGuests])

  const form = useForm<EpisodeContextFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(EpisodeContextFormSchema) as any,
    defaultValues: initialValues,
  })

  const { register, formState: { errors }, control, setValue } = form

  const { fields: guestFields, append, remove } = useFieldArray({
    control,
    name: 'guests',
  })

  // useWatch subscribes to form changes and triggers re-renders
  const formValues = useWatch({ control }) as EpisodeContextFormData

  const coHost = formValues.coHost
  const hasCoHostData = hasGuestData(coHost)

  // Sync hasCoHost field with actual coHost data presence
  useEffect(() => {
    setValue('hasCoHost', hasCoHostData)
  }, [hasCoHostData, setValue])

  /**
   * Save context to API.
   * Only sends guests that have ALL required fields filled (name, role, linkedin).
   * Partial guests are kept in form but not persisted until complete.
   */
  const saveContext = useCallback(async (formData: EpisodeContextFormData) => {
    // Build guests array with co-host first (if present)
    // Only include guests that are COMPLETE (all required fields filled)
    const guests: Guest[] = []
    if (formData.hasCoHost && formData.coHost && isGuestComplete(formData.coHost)) {
      guests.push(formData.coHost)
    }
    guests.push(...formData.guests.filter(g => isGuestComplete(g)))

    const response = await fetch(`/api/videos/${video.id}/context`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme: formData.theme,
        guests,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || 'Falha ao salvar contexto')
    }

    log('INFO', 'Context auto-saved', { videoId: video.id })
  }, [video.id])

  // Auto-save context fields
  const { saveStatus, error: saveError } = useAutoSave(
    formValues,
    saveContext,
    1500
  )

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
    <div className={cn('h-full', className)}>
      <div className="space-y-6 p-4">
        {/* Error message */}
        {hasError && phaseState.error && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <p className="text-sm text-destructive text-center">
                {phaseState.error}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Context inputs form (always visible, auto-saves) */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Contexto do Episódio</CardTitle>
              <SaveStatusIndicator status={saveStatus} />
            </div>
            <CardDescription>
              Preencha as informações do episódio. As alterações são salvas automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Save error */}
            {saveError && (
              <p className="text-xs text-destructive">{saveError.message}</p>
            )}

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
            <Accordion type="single" collapsible defaultValue={hasCoHostData ? 'cohost' : undefined}>
              <AccordionItem value="cohost" className="border rounded-lg">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <span className="text-sm font-medium">
                    Co-host <span className="text-muted-foreground font-normal">(opcional)</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-6">
                  <div className="mb-1">
                    <PersonForm
                      form={form}
                      prefix="coHost"
                      label="Dados do Co-host"
                      required={false}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
