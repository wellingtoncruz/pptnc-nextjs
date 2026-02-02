'use client'

import { useCallback, useRef, useEffect } from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { PodcastSettingsForm } from './podcast-settings-form'
import { PromptsSettingsForm } from './prompts-settings-form'
import { PersonasSettingsForm } from './personas-settings-form'
import { DurationSettingsForm } from './duration-settings-form'
import { ResyncSection } from './resync-section'
import { useAccordionState } from '@/hooks/use-accordion-state'
import { log } from '@/lib/logger'
import type { SerializedPodcast, PromptField, Persona, Prompts, Personas } from '@/types/podcast'

/**
 * Section IDs for accordion persistence.
 */
const SECTION_IDS = {
  PODCAST: 'podcast',
  DURATION: 'duration',
  PERSONAS: 'personas',
  PROMPTS: 'prompts',
  SYNC: 'sync',
} as const

/**
 * Default: all sections collapsed on first visit.
 */
const DEFAULT_SECTIONS: string[] = []

/**
 * localStorage key for persisting accordion state.
 */
const STORAGE_KEY = 'settings-accordion-state'

interface SettingsPageClientProps {
  podcast: SerializedPodcast
}

/**
 * Client component wrapper for all settings forms.
 *
 * Features:
 * - Collapsible accordion sections with localStorage persistence
 * - All sections collapsed by default on first visit
 * - API calls for podcast settings, prompts, personas, and durations
 * - Uses refs to track latest state and prevent stale closure issues
 *
 * @see docs/stories/8-2-secoes-colapsaveis.md
 */
export function SettingsPageClient({ podcast }: SettingsPageClientProps) {
  // Accordion state with localStorage persistence
  const [openSections, setOpenSections] = useAccordionState(STORAGE_KEY, DEFAULT_SECTIONS)

  // Use refs to always have access to latest state in callbacks
  // This prevents stale closure issues when multiple saves happen quickly
  const promptsRef = useRef<Prompts>(podcast.prompts)
  const personasRef = useRef<Personas>(podcast.personas)

  // Keep refs in sync with props
  useEffect(() => {
    promptsRef.current = podcast.prompts
  }, [podcast.prompts])

  useEffect(() => {
    personasRef.current = podcast.personas
  }, [podcast.personas])

  const handleSavePromptField = useCallback(
    async (
      videoType: 'episode' | 'cut' | 'reel',
      fieldName: string,
      value: PromptField
    ) => {
      // Update ref immediately to capture this change for subsequent saves
      const currentPrompts = promptsRef.current
      const updatedPrompts = {
        ...currentPrompts,
        [videoType]: {
          ...currentPrompts[videoType],
          [fieldName]: value,
        },
      }
      promptsRef.current = updatedPrompts

      // Build the nested update structure using latest ref value
      const response = await fetch('/api/podcast', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts: updatedPrompts,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        const message = error?.error?.message || 'Erro ao salvar prompt'
        log('ERROR', 'Failed to save prompt field', { videoType, fieldName, error: message })
        throw new Error(message)
      }
    },
    [] // No dependencies - uses refs instead
  )

  const handleSavePersona = useCallback(
    async (personaKey: 'critic' | 'writer', value: Persona) => {
      // Update ref immediately to capture this change for subsequent saves
      const currentPersonas = personasRef.current
      const updatedPersonas = {
        ...currentPersonas,
        [personaKey]: value,
      }
      personasRef.current = updatedPersonas

      const response = await fetch('/api/podcast', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personas: updatedPersonas,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        const message = error?.error?.message || 'Erro ao salvar persona'
        log('ERROR', 'Failed to save persona', { personaKey, error: message })
        throw new Error(message)
      }
    },
    [] // No dependencies - uses refs instead
  )

  const handleSaveVideoTypes = useCallback(
    async (videoTypes: typeof podcast.videoTypes) => {
      const response = await fetch('/api/podcast', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoTypes }),
      })

      if (!response.ok) {
        const error = await response.json()
        const message = error?.error?.message || 'Erro ao salvar configuração de duração'
        log('ERROR', 'Failed to save video types', { error: message })
        throw new Error(message)
      }
    },
    [podcast]
  )

  return (
    <Accordion
      type="multiple"
      value={openSections}
      onValueChange={setOpenSections}
      className="space-y-4"
    >
      {/* Podcast Settings */}
      <AccordionItem value={SECTION_IDS.PODCAST} className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 text-lg font-semibold hover:no-underline">
          Informações do Podcast
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <PodcastSettingsForm podcast={podcast} />
        </AccordionContent>
      </AccordionItem>

      {/* Duration Settings */}
      <AccordionItem value={SECTION_IDS.DURATION} className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 text-lg font-semibold hover:no-underline">
          Duração por Tipo de Vídeo
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <DurationSettingsForm videoTypes={podcast.videoTypes} onSave={handleSaveVideoTypes} />
        </AccordionContent>
      </AccordionItem>

      {/* Personas Settings */}
      <AccordionItem value={SECTION_IDS.PERSONAS} className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 text-lg font-semibold hover:no-underline">
          Personas do LLM
        </AccordionTrigger>
        <AccordionContent forceOverflow className="px-6 pb-6">
          <PersonasSettingsForm personas={podcast.personas} onSavePersona={handleSavePersona} />
        </AccordionContent>
      </AccordionItem>

      {/* Prompts Settings */}
      <AccordionItem value={SECTION_IDS.PROMPTS} className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 text-lg font-semibold hover:no-underline">
          Prompts por Tipo de Vídeo
        </AccordionTrigger>
        <AccordionContent forceOverflow className="px-6 pb-6">
          <PromptsSettingsForm prompts={podcast.prompts} onSavePromptField={handleSavePromptField} />
        </AccordionContent>
      </AccordionItem>

      {/* Sync Settings */}
      <AccordionItem value={SECTION_IDS.SYNC} className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 text-lg font-semibold hover:no-underline">
          Sincronização
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <ResyncSection />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
