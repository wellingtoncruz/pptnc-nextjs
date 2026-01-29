'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PromptFieldEditor } from './prompt-field-editor'
import type { Prompts, PromptField, EpisodePrompts, CutPrompts, ReelPrompts } from '@/types/podcast'

/**
 * Type-safe field keys for each video type.
 */
type EpisodeFieldKey = keyof EpisodePrompts
type CutFieldKey = keyof CutPrompts
type ReelFieldKey = keyof ReelPrompts

interface PromptsSettingsFormProps {
  prompts: Prompts
  onSavePromptField: (
    videoType: 'episode' | 'cut' | 'reel',
    fieldName: string,
    value: PromptField
  ) => Promise<void>
}

/**
 * Labels for prompt fields in PT-BR.
 */
const FIELD_LABELS: Record<EpisodeFieldKey | CutFieldKey | ReelFieldKey, string> = {
  // Episode fields
  critique: 'Crítica',
  editing: 'Edição',
  compliance: 'Conformidade',
  chapters: 'Capítulos',
  titles: 'Títulos',
  description: 'Descrição',
  tags: 'Tags',
  // Cut-specific
  thumbs: 'Thumbnails',
}

/**
 * Ordered field keys for each video type to ensure consistent rendering.
 */
const EPISODE_FIELDS: EpisodeFieldKey[] = ['critique', 'editing', 'compliance', 'chapters', 'titles', 'description', 'tags']
const CUT_FIELDS: CutFieldKey[] = ['titles', 'thumbs', 'description', 'tags']
const REEL_FIELDS: ReelFieldKey[] = ['titles', 'description', 'tags']

/**
 * Form for editing AI prompts for each video type.
 *
 * Features:
 * - Accordion layout for 3 video types (episode, cut, reel)
 * - Each video type has multiple prompt fields
 * - PromptFieldEditor for each field with auto-save
 * - Labels in PT-BR
 */
export function PromptsSettingsForm({ prompts, onSavePromptField }: PromptsSettingsFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompts por Tipo de Vídeo</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {/* Episode prompts */}
          <AccordionItem value="episode">
            <AccordionTrigger>Episódios</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {EPISODE_FIELDS.map((fieldName) => (
                  <PromptFieldEditor
                    key={`episode-${fieldName}`}
                    fieldKey={`episode-${fieldName}`}
                    label={FIELD_LABELS[fieldName]}
                    initialValue={prompts.episode[fieldName]}
                    onSave={(value) => onSavePromptField('episode', fieldName, value)}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Cut prompts */}
          <AccordionItem value="cut">
            <AccordionTrigger>Cortes</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {CUT_FIELDS.map((fieldName) => (
                  <PromptFieldEditor
                    key={`cut-${fieldName}`}
                    fieldKey={`cut-${fieldName}`}
                    label={FIELD_LABELS[fieldName]}
                    initialValue={prompts.cut[fieldName]}
                    onSave={(value) => onSavePromptField('cut', fieldName, value)}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Reel prompts */}
          <AccordionItem value="reel">
            <AccordionTrigger>Reels</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {REEL_FIELDS.map((fieldName) => (
                  <PromptFieldEditor
                    key={`reel-${fieldName}`}
                    fieldKey={`reel-${fieldName}`}
                    label={FIELD_LABELS[fieldName]}
                    initialValue={prompts.reel[fieldName]}
                    onSave={(value) => onSavePromptField('reel', fieldName, value)}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
