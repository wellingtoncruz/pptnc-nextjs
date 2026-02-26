'use client'

import { PersonaEditor } from './persona-editor'
import { DEFAULT_PERSONA } from '@/lib/schemas/podcast'
import type { Personas, Persona, PersonaKey } from '@/types/podcast'

interface PersonasSettingsFormProps {
  personas: Personas
  onSavePersona: (personaKey: PersonaKey, value: Persona) => Promise<void>
}

/**
 * Labels for personas in PT-BR.
 */
const PERSONA_LABELS: Record<PersonaKey, string> = {
  critic: 'Crítico',
  writer: 'Redator',
  socialmedia: 'Gerente de Mídia',
  adwords: 'Especialista em AdWords',
}

/**
 * Form for editing LLM personas.
 *
 * Features:
 * - Four persona editors (critic, writer, socialmedia, adwords)
 * - PersonaEditor for each persona with auto-save
 * - Labels in PT-BR
 *
 * Note: Title is rendered by parent AccordionTrigger.
 * @see docs/stories/8-2-secoes-colapsaveis.md
 */
export function PersonasSettingsForm({ personas, onSavePersona }: PersonasSettingsFormProps) {
  return (
    <div className="space-y-4">
      <PersonaEditor
        personaKey="critic"
        label={PERSONA_LABELS.critic}
        initialValue={personas.critic}
        onSave={(value) => onSavePersona('critic', value)}
      />
      <PersonaEditor
        personaKey="writer"
        label={PERSONA_LABELS.writer}
        initialValue={personas.writer}
        onSave={(value) => onSavePersona('writer', value)}
      />
      <PersonaEditor
        personaKey="socialmedia"
        label={PERSONA_LABELS.socialmedia}
        initialValue={personas.socialmedia ?? DEFAULT_PERSONA}
        onSave={(value) => onSavePersona('socialmedia', value)}
      />
      <PersonaEditor
        personaKey="adwords"
        label={PERSONA_LABELS.adwords}
        initialValue={personas.adwords ?? DEFAULT_PERSONA}
        onSave={(value) => onSavePersona('adwords', value)}
      />
    </div>
  )
}
