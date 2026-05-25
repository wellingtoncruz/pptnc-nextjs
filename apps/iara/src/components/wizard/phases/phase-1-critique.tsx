'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRightIcon, PlusIcon, Loader2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { getNextPhaseName } from '@/lib/wizard'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video, Guest, EpisodeContextFormData } from '@/types/video'
import type { Phase1Response } from '@/lib/llm'

interface Phase1CritiqueProps {
  wizard: UseWizardReturn
  video: Video
  /** Critique result from orchestrator (may be null while processing) */
  critique: Phase1Response | null
  /** Callback when context (theme, guests) changes - used to sync parent state */
  onContextChange?: (context: { theme?: string; guests?: Guest[] }) => void
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
 * Accepts both strict Guest and lenient GuestDisplay types.
 */
function hasGuestData(guest: Partial<Guest> | undefined): boolean {
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
  onContextChange,
  className,
}: Phase1CritiqueProps) {
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
    spotifyUrl: video.spotifyUrl ?? '',
  }), [video.theme, existingCoHost, existingGuests, video.spotifyUrl])

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

  // Track which LinkedIn URLs have already been scraped to avoid redundant API calls.
  // Initialize with existing URLs from the video — these were either already scraped
  // in a previous session or will be scraped on first save. Only truly NEW URLs
  // added during this session should trigger scraping.
  const scrapedLinkedInUrlsRef = useRef<Set<string>>(
    new Set(video.guests?.map(g => g.linkedin).filter(Boolean) as string[] ?? [])
  )

  // Track scraping state to block advancement while LinkedIn profiles are being fetched
  const [isScraping, setIsScraping] = useState(false)
  /**
   * Sticky banner shown when /api/guests/scrape returns 503 (CONFIG_ERROR).
   * Indicates BrightData is unreachable — usually missing/invalid API key.
   * Producer keeps the URL but fills name/role/company manually. (Story 24.4)
   */
  const [scrapeConfigError, setScrapeConfigError] = useState<string | null>(null)
  /**
   * Toast-like notice when /api/guests/scrape returns 200 with failedUrls.
   * Cleared on next successful scrape. (Story 24.4)
   */
  const [scrapeFailedUrls, setScrapeFailedUrls] = useState<string[]>([])

  /**
   * Per-person enrichment status (Story 24.7):
   * - 'awaiting' — sem dados scraped ainda; name/role/company desabilitados, LinkedIn habilitado
   * - 'scraping' — scrape em andamento; tudo desabilitado, label "Buscando..."
   * - 'enriched' — scrape concluído com sucesso e campos preenchidos; tudo habilitado pra correção
   * - 'manual' — scrape falhou ou retornou vazio; tudo habilitado pra preenchimento manual
   *
   * Keys MUST match the react-hook-form field paths exactly: 'coHost' (camelCase,
   * not 'cohost') and `guests.0`, `guests.1`, etc. Mismatch causes setValue to
   * write to a non-existent field — verified 2026-05-17 with luisrudi.
   * Initial state derives from existing data: se já tem name preenchido, considera 'enriched'.
   */
  type EnrichmentStatus = 'awaiting' | 'scraping' | 'enriched' | 'manual'
  const initialEnrichmentState = useMemo<Record<string, EnrichmentStatus>>(() => {
    const state: Record<string, EnrichmentStatus> = {}
    const coHostHasName = Boolean(existingCoHost?.name?.trim())
    state.coHost = coHostHasName ? 'enriched' : 'awaiting'
    ;(existingGuests as Guest[]).forEach((g, i) => {
      state[`guests.${i}`] = g?.name?.trim() ? 'enriched' : 'awaiting'
    })
    return state
  // existingCoHost / existingGuests are stable per-mount (built from `video`), no need to re-derive.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [enrichmentStatus, setEnrichmentStatus] =
    useState<Record<string, EnrichmentStatus>>(initialEnrichmentState)

  const setEnrichmentFor = useCallback((key: string, status: EnrichmentStatus) => {
    setEnrichmentStatus((prev) => (prev[key] === status ? prev : { ...prev, [key]: status }))
  }, [])

  /** Avatar URL per person key (Story 24.7 polish): set after a successful scrape. */
  const [enrichmentAvatars, setEnrichmentAvatars] = useState<Record<string, string>>({})

  /** Names of fields that came back empty after scrape and need manual input (Story 24.7 polish). */
  type MissingField = 'name' | 'role' | 'company'
  const [enrichmentMissing, setEnrichmentMissing] =
    useState<Record<string, ReadonlySet<MissingField>>>({})

  const markMissingFor = useCallback((key: string, fields: ReadonlySet<MissingField>) => {
    setEnrichmentMissing((prev) => ({ ...prev, [key]: fields }))
  }, [])

  const clearMissingFor = useCallback((key: string) => {
    setEnrichmentMissing((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  /** Returns the form key (`coHost` or `guests.N`) for a given LinkedIn URL.
   *  CASE MATTERS — must match the field path registered by react-hook-form
   *  (PersonForm uses `prefix="coHost"`, NOT 'cohost'). */
  const findKeyByLinkedinUrl = useCallback(
    (url: string, formData: EpisodeContextFormData): string | null => {
      if (formData.hasCoHost && formData.coHost?.linkedin?.trim() === url) return 'coHost'
      const idx = formData.guests.findIndex((g) => g.linkedin?.trim() === url)
      return idx >= 0 ? `guests.${idx}` : null
    },
    []
  )

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
        // Empty values become undefined so the backend doesn't see "''" and trip
        // .min(1) refinements during incremental typing. Backend tolerates both.
        theme: formData.theme?.trim() ? formData.theme : undefined,
        guests,
        spotifyUrl: formData.spotifyUrl || '',
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || 'Falha ao salvar contexto')
    }

    // Scrape LinkedIn profiles for ALL guests with linkedin URL (not just complete ones)
    // This ensures scraping happens even if role is not yet filled
    const allGuests: Guest[] = []
    if (formData.hasCoHost && formData.coHost?.linkedin?.trim()) {
      allGuests.push(formData.coHost)
    }
    allGuests.push(...formData.guests.filter(g => g.linkedin?.trim()))

    const linkedinUrls = allGuests.map(g => g.linkedin).filter(Boolean) as string[]
    const newUrls = linkedinUrls.filter(url => !scrapedLinkedInUrlsRef.current.has(url))

    if (newUrls.length > 0) {
      // Mark as scraped before firing to prevent duplicates from rapid saves
      newUrls.forEach(url => scrapedLinkedInUrlsRef.current.add(url))

      // Story 24.7 — Mark each guest with a new URL as 'scraping' so fields stay locked
      // while BrightData fills them in.
      for (const url of newUrls) {
        const key = findKeyByLinkedinUrl(url, formData)
        if (key) setEnrichmentFor(key, 'scraping')
      }

      setIsScraping(true)
      try {
        const scrapeResponse = await fetch('/api/guests/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: video.id, linkedinUrls: newUrls }),
        })

        // Story 24.4: CONFIG_ERROR → sticky banner. Operational errors → toast list.
        if (scrapeResponse.status === 503) {
          const payload = await scrapeResponse.json().catch(() => ({}))
          setScrapeConfigError(
            payload?.error?.message ||
              'Serviço de enriquecimento indisponível. Preencha manualmente.'
          )
          // Story 24.7 — todos os newUrls vão pra 'manual' (campos abrem vazios + highlight).
          for (const url of newUrls) {
            const key = findKeyByLinkedinUrl(url, formData)
            if (key) {
              setEnrichmentFor(key, 'manual')
              markMissingFor(key, new Set<MissingField>(['name', 'role', 'company']))
            }
          }
        } else if (scrapeResponse.ok) {
          const payload = await scrapeResponse.json().catch(() => ({}))
          const failed: string[] = payload?.data?.failedUrls ?? []
          const scraped: Array<{
            linkedinUrl: string
            name: string | null
            role: string | null
            company: string | null
            photoUrl?: string | null
          }> = payload?.data?.scrapedGuests ?? []

          if (failed.length > 0) {
            setScrapeFailedUrls(failed)
          } else {
            setScrapeConfigError(null)
            setScrapeFailedUrls([])
          }

          // Story 24.7 — preencher campos para os que vieram com sucesso.
          for (const sg of scraped) {
            const key = findKeyByLinkedinUrl(sg.linkedinUrl, formData)
            if (!key) continue
            if (sg.name) setValue(`${key}.name` as 'coHost.name', sg.name, { shouldDirty: true, shouldTouch: true })
            if (sg.role) setValue(`${key}.role` as 'coHost.role', sg.role, { shouldDirty: true, shouldTouch: true })
            if (sg.company) setValue(`${key}.company` as 'coHost.company', sg.company, { shouldDirty: true, shouldTouch: true })
            setEnrichmentFor(key, 'enriched')

            // Avatar inline (Story 24.7 polish).
            if (sg.photoUrl) {
              setEnrichmentAvatars((prev) => ({ ...prev, [key]: sg.photoUrl as string }))
            }

            // Highlight the fields BrightData didn't provide so the producer
            // knows what still needs manual input.
            const missing = new Set<MissingField>()
            if (!sg.name?.trim()) missing.add('name')
            if (!sg.role?.trim()) missing.add('role')
            if (!sg.company?.trim()) missing.add('company')
            if (missing.size > 0) markMissingFor(key, missing)
            else clearMissingFor(key)
          }

          // For URLs that operationally failed (in failed[]), open all 3 manual.
          for (const url of failed) {
            const key = findKeyByLinkedinUrl(url, formData)
            if (key) {
              setEnrichmentFor(key, 'manual')
              markMissingFor(key, new Set<MissingField>(['name', 'role', 'company']))
            }
          }
        }
      } catch {
        // Scraping failure doesn't block the producer — they continue with manual data
        // Story 24.7 — em exceção, abrir campos para preenchimento manual + highlight.
        for (const url of newUrls) {
          const key = findKeyByLinkedinUrl(url, formData)
          if (key) {
            setEnrichmentFor(key, 'manual')
            markMissingFor(key, new Set<MissingField>(['name', 'role', 'company']))
          }
        }
      } finally {
        setIsScraping(false)
      }
    }

    // Notify parent of context change so video data stays in sync
    onContextChange?.({ theme: formData.theme, guests })

    log('INFO', 'Context auto-saved', { videoId: video.id })
  }, [video.id, onContextChange])

  // Auto-save context fields
  const { saveStatus, error: saveError, save } = useAutoSave(
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

  /**
   * Check if advancement criteria are met per processamento_video.md:
   * 1. Retorno do LLM com sucesso (critique !== null)
   * 2. Campo critique persistido (implied by critique !== null)
   * 3. Inputs preenchidos: tema do episódio e convidados
   */
  const hasTheme = Boolean(formValues.theme?.trim())
  const hasCompleteGuest = formValues.guests?.some(g => isGuestComplete(g)) ?? false
  const hasCritique = critique !== null

  // State for advancing to next phase (prevents double clicks)
  const [isAdvancing, setIsAdvancing] = useState(false)

  const canAdvance = hasCritique && hasTheme && hasCompleteGuest && !isAdvancing && !isScraping

  const handleAdvance = async () => {
    if (!canAdvance || !critique) return

    setIsAdvancing(true)

    // Flush the auto-save before transitioning so debounced changes
    // (Spotify URL, theme, guests) are persisted before navigation.
    // `rethrow: true` makes save() surface failures so we can block the advance.
    try {
      await save({ rethrow: true })
    } catch {
      // save() already sets saveStatus='error' and saveError — banner exibe.
      // Não avançamos sem persistência confirmada.
      setIsAdvancing(false)
      return
    }

    wizard.completePhaseAndAdvance('critique', critique)
    log('INFO', 'Advancing from Phase 1 to Phase 2', { videoId: video.id })
  }

  return (
    <div className={cn('h-full', className)}>
      <div className="space-y-6 p-4">
        {/* Context inputs form (always visible, auto-saves) */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Contexto do Episódio</CardTitle>
              <SaveStatusIndicator
                status={saveStatus}
                busyLabel={isScraping ? 'Enriquecendo dados do LinkedIn...' : undefined}
              />
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

            {/* Scrape CONFIG error — sticky banner (Story 24.4) */}
            {scrapeConfigError && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <strong className="font-medium">Enriquecimento indisponível:</strong>{' '}
                {scrapeConfigError}
              </div>
            )}

            {/* Scrape operational failures — list of URLs (Story 24.4) */}
            {scrapeFailedUrls.length > 0 && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs"
              >
                <p className="font-medium mb-1">
                  Não foi possível enriquecer {scrapeFailedUrls.length} URL(s) do LinkedIn:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {scrapeFailedUrls.map((url) => (
                    <li key={url} className="break-all">{url}</li>
                  ))}
                </ul>
              </div>
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
                      nonLinkedinFieldsLocked={
                        enrichmentStatus.coHost === 'awaiting' ||
                        enrichmentStatus.coHost === 'scraping'
                      }
                      avatarUrl={enrichmentAvatars.coHost}
                      missingFields={enrichmentMissing.coHost}
                      onAvatarUploaded={(url) =>
                        setEnrichmentAvatars((prev) => ({ ...prev, coHost: url }))
                      }
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
                {guestFields.map((field, index) => {
                  const key = `guests.${index}`
                  const status = enrichmentStatus[key] ?? 'awaiting'
                  return (
                    <PersonForm
                      key={field.id}
                      form={form}
                      prefix={key}
                      label={`Convidado ${index + 1}`}
                      required={true}
                      showRemove={guestFields.length > 1}
                      onRemove={() => handleRemoveGuest(index)}
                      nonLinkedinFieldsLocked={status === 'awaiting' || status === 'scraping'}
                      avatarUrl={enrichmentAvatars[key]}
                      missingFields={enrichmentMissing[key]}
                      onAvatarUploaded={(url) =>
                        setEnrichmentAvatars((prev) => ({ ...prev, [key]: url }))
                      }
                    />
                  )
                })}
              </div>
            </div>
            {/* Spotify URL (optional, episodes only) */}
            <div className="space-y-2">
              <Label htmlFor="spotifyUrl">
                URL do Spotify <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
              </Label>
              <Input
                id="spotifyUrl"
                type="url"
                placeholder="https://open.spotify.com/episode/..."
                {...register('spotifyUrl')}
              />
              {errors.spotifyUrl && (
                <p className="text-xs text-destructive">{errors.spotifyUrl.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Advancement button per processamento_video.md */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleAdvance}
            disabled={!canAdvance}
            className="w-full"
            size="lg"
          >
            {isAdvancing ? (
              <>
                Avançando...
                <Loader2Icon className="size-4 ml-2 animate-spin" />
              </>
            ) : isScraping ? (
              <>
                Buscando LinkedIn...
                <Loader2Icon className="size-4 ml-2 animate-spin" />
              </>
            ) : (
              <>
                Avançar para {getNextPhaseName('critique')}
                <ArrowRightIcon className="size-4 ml-2" />
              </>
            )}
          </Button>
          {!canAdvance && !isAdvancing && (
            <p className="text-xs text-muted-foreground text-center">
              {isScraping && 'Buscando dados do LinkedIn, aguarde...'}
              {!isScraping && !hasCritique && 'Aguardando processamento da crítica...'}
              {!isScraping && hasCritique && !hasTheme && 'Preencha o tema do episódio para avançar.'}
              {!isScraping && hasCritique && hasTheme && !hasCompleteGuest && 'Preencha pelo menos um convidado completo para avançar.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
