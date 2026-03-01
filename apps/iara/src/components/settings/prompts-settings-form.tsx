'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { PromptFieldEditor } from './prompt-field-editor'
import { DEFAULT_PROMPT_FIELD } from '@/lib/schemas/podcast'
import type { Prompts, PromptField, EpisodePrompts, CutPrompts, ReelPrompts } from '@/types/podcast'

/**
 * Type-safe field keys for each video type.
 */
type EpisodeFieldKey = Exclude<keyof EpisodePrompts, 'social' | 'adwords' | 'newsletter'>
type CutFieldKey = Exclude<keyof CutPrompts, 'social'>
type ReelFieldKey = Exclude<keyof ReelPrompts, 'social'>

interface PromptsSettingsFormProps {
  prompts: Prompts
  enabledSocialNetworks: string[]
  socialNetworks: Array<{ id: string; name: string; icon: string }>
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
 *
 * Note: Title is rendered by parent AccordionTrigger.
 * @see docs/stories/8-2-secoes-colapsaveis.md
 */
export function PromptsSettingsForm({ prompts, enabledSocialNetworks, socialNetworks, onSavePromptField }: PromptsSettingsFormProps) {
  function renderSocialPrompts(videoType: 'episode' | 'cut' | 'reel') {
    if (enabledSocialNetworks.length === 0) return null

    return (
      <div className="mt-6 pt-4 border-t">
        <h4 className="text-sm font-medium text-muted-foreground mb-4">Redes Sociais</h4>
        <div className="space-y-4">
          {enabledSocialNetworks.map((networkId) => {
            const network = socialNetworks.find(n => n.id === networkId)
            if (!network) return null
            return (
              <PromptFieldEditor
                key={`${videoType}-social-${networkId}`}
                fieldKey={`${videoType}-social-${networkId}`}
                label={`${network.icon} ${network.name}`}
                initialValue={prompts[videoType].social?.[networkId] ?? DEFAULT_PROMPT_FIELD}
                onSave={(value) => onSavePromptField(videoType, `social.${networkId}`, value)}
              />
            )
          })}
        </div>
      </div>
    )
  }

  function renderAdwordsPrompt(videoType: 'episode' | 'cut' | 'reel') {
    if (videoType !== 'episode') return null

    return (
      <div className="mt-6 pt-4 border-t">
        <h4 className="text-sm font-medium text-muted-foreground mb-4">Tráfego Pago</h4>
        <PromptFieldEditor
          fieldKey="episode-adwords"
          label="AdWords"
          initialValue={prompts.episode.adwords ?? DEFAULT_PROMPT_FIELD}
          onSave={(value) => onSavePromptField('episode', 'adwords', value)}
        />
      </div>
    )
  }

  function renderNewsletterPrompts(videoType: 'episode' | 'cut' | 'reel') {
    if (videoType !== 'episode') return null

    const NEWSLETTER_SECTIONS = [
      { key: 'draft', label: 'Draft' },
      { key: 'news', label: 'Notícias' },
      { key: 'image', label: 'Imagem' },
      { key: 'format', label: 'Formato' },
    ] as const

    return (
      <div className="mt-6 pt-4 border-t">
        <h4 className="text-sm font-medium text-muted-foreground mb-4">Newsletter</h4>
        <div className="space-y-4">
          {NEWSLETTER_SECTIONS.map(({ key, label }) => (
            <PromptFieldEditor
              key={`episode-newsletter-${key}`}
              fieldKey={`episode-newsletter-${key}`}
              label={label}
              initialValue={prompts.episode.newsletter?.[key] ?? DEFAULT_PROMPT_FIELD}
              onSave={(value) => onSavePromptField('episode', `newsletter.${key}`, value)}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <Accordion type="single" collapsible className="w-full">
      {/* Episode prompts */}
      <AccordionItem value="episode">
        <AccordionTrigger>Episódios</AccordionTrigger>
        <AccordionContent forceOverflow>
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
            {renderSocialPrompts('episode')}
            {renderAdwordsPrompt('episode')}
            {renderNewsletterPrompts('episode')}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Cut prompts */}
      <AccordionItem value="cut">
        <AccordionTrigger>Cortes</AccordionTrigger>
        <AccordionContent forceOverflow>
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
            {renderSocialPrompts('cut')}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* Reel prompts */}
      <AccordionItem value="reel">
        <AccordionTrigger>Reels</AccordionTrigger>
        <AccordionContent forceOverflow>
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
            {renderSocialPrompts('reel')}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
