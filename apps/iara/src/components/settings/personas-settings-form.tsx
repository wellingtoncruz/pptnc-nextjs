'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PersonaEditor } from './persona-editor'
import type { Personas, Persona } from '@/types/podcast'

interface PersonasSettingsFormProps {
  personas: Personas
  onSavePersona: (personaKey: 'critic' | 'writer', value: Persona) => Promise<void>
}

/**
 * Labels for personas in PT-BR.
 */
const PERSONA_LABELS: Record<'critic' | 'writer', string> = {
  critic: 'Crítico',
  writer: 'Redator',
}

/**
 * Form for editing LLM personas.
 *
 * Features:
 * - Card layout with two persona editors (critic, writer)
 * - PersonaEditor for each persona with auto-save
 * - Labels in PT-BR
 */
export function PersonasSettingsForm({ personas, onSavePersona }: PersonasSettingsFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Personas do LLM</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  )
}
