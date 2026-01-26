'use client'

import { useCallback, useRef, useEffect } from 'react'

import { PodcastSettingsForm } from './podcast-settings-form'
import { PromptsSettingsForm } from './prompts-settings-form'
import { PersonasSettingsForm } from './personas-settings-form'
import { DurationSettingsForm } from './duration-settings-form'
import { log } from '@/lib/logger'
import type { SerializedPodcast } from '@/app/settings/page'
import type { PromptField, Persona, Prompts, Personas } from '@/types/podcast'

interface SettingsPageClientProps {
  podcast: SerializedPodcast
}

/**
 * Client component wrapper for all settings forms.
 *
 * Handles API calls for:
 * - Podcast basic settings (name, channelId)
 * - Prompts by video type and field
 * - Personas (critic, writer)
 * - Duration thresholds by video type
 *
 * Uses refs to track latest state and prevent stale closure issues
 * when multiple fields are edited in rapid succession.
 */
export function SettingsPageClient({ podcast }: SettingsPageClientProps) {
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
    <div className="space-y-6">
      <PodcastSettingsForm podcast={podcast} />
      <DurationSettingsForm videoTypes={podcast.videoTypes} onSave={handleSaveVideoTypes} />
      <PersonasSettingsForm personas={podcast.personas} onSavePersona={handleSavePersona} />
      <PromptsSettingsForm prompts={podcast.prompts} onSavePromptField={handleSavePromptField} />
    </div>
  )
}
