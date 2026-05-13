'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { PromptFieldEditor } from './prompt-field-editor'
import { ThumbnailPromptFieldEditor } from './thumbnail-prompt-field-editor'
import { DEFAULT_PROMPT_FIELD, DEFAULT_THUMBNAIL_PROMPT_FIELD } from '@/lib/schemas/podcast'
import type { Prompts, PromptField, ThumbnailPromptField, EpisodePrompts, CutPrompts, ReelPrompts } from '@/types/podcast'

/**
 * Type-safe field keys for each video type.
 */
type EpisodeFieldKey = Exclude<keyof EpisodePrompts, 'social' | 'adwords' | 'newsletter' | 'thumbnail'>
type CutFieldKey = Exclude<keyof CutPrompts, 'social' | 'thumbnail'>
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
  /**
   * Save handler for thumbnail prompt fields (Epic 22).
   * Called when the producer edits the Thumbnail sub-section in Episode or Cut.
   */
  onSaveThumbnailPromptField?: (
    videoType: 'episode' | 'cut',
    value: ThumbnailPromptField
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
  topics: 'Tópicos',
  // Cut-specific — legacy textual brief (Phase 5B). Renamed to disambiguate from
  // the image generation flow added in Epic 22 (see ThumbnailPromptFieldEditor below).
  thumbs: 'Brief de Thumbnail (texto)',
}

/**
 * Ordered field keys for each video type to ensure consistent rendering.
 */
const EPISODE_FIELDS: EpisodeFieldKey[] = ['critique', 'editing', 'compliance', 'chapters', 'titles', 'description', 'tags', 'topics']
const CUT_FIELDS: CutFieldKey[] = ['titles', 'thumbs', 'description', 'tags', 'topics']
const REEL_FIELDS: ReelFieldKey[] = ['titles', 'description', 'tags', 'topics']

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
export function PromptsSettingsForm({ prompts, enabledSocialNetworks, socialNetworks, onSavePromptField, onSaveThumbnailPromptField }: PromptsSettingsFormProps) {
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

  function renderThumbnailPrompt(videoType: 'episode' | 'cut' | 'reel') {
    if (videoType !== 'episode' && videoType !== 'cut') return null
    if (!onSaveThumbnailPromptField) return null

    return (
      <div key={`${videoType}-thumbnail-section`} className="mt-6 pt-4 border-t">
        <h4 className="text-sm font-medium text-muted-foreground mb-4">Geração de Thumbnail (imagem)</h4>
        <p className="text-xs text-muted-foreground mb-4">
          Configuração da geração de thumbnail via IAra para a fase Thumbnail do wizard.
          A imagem <strong>Base</strong> define a composição/arte que o modelo usa como ponto
          de partida. A imagem <strong>Referência</strong> tem suas características visuais
          reproduzidas pelo modelo, adaptadas ao novo contexto.
        </p>
        <ThumbnailPromptFieldEditor
          fieldKey={`${videoType}-thumbnail`}
          videoType={videoType}
          initialValue={prompts[videoType].thumbnail ?? DEFAULT_THUMBNAIL_PROMPT_FIELD}
          onSave={(value) => onSaveThumbnailPromptField(videoType, value)}
        />
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
            {EPISODE_FIELDS.flatMap((fieldName) => {
              const editor = (
                <PromptFieldEditor
                  key={`episode-${fieldName}`}
                  fieldKey={`episode-${fieldName}`}
                  label={FIELD_LABELS[fieldName]}
                  initialValue={prompts.episode[fieldName] ?? DEFAULT_PROMPT_FIELD}
                  onSave={(value) => onSavePromptField('episode', fieldName, value)}
                />
              )
              // Thumbnail (Epic 22) is a wizard phase between Tags and Publicar,
              // so it renders immediately after the `tags` field in Settings.
              if (fieldName === 'tags') {
                const thumbnail = renderThumbnailPrompt('episode')
                return thumbnail ? [editor, thumbnail] : [editor]
              }
              return [editor]
            })}
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
            {CUT_FIELDS.flatMap((fieldName) => {
              const editor = (
                <PromptFieldEditor
                  key={`cut-${fieldName}`}
                  fieldKey={`cut-${fieldName}`}
                  label={FIELD_LABELS[fieldName]}
                  initialValue={prompts.cut[fieldName] ?? DEFAULT_PROMPT_FIELD}
                  onSave={(value) => onSavePromptField('cut', fieldName, value)}
                />
              )
              if (fieldName === 'tags') {
                const thumbnail = renderThumbnailPrompt('cut')
                return thumbnail ? [editor, thumbnail] : [editor]
              }
              return [editor]
            })}
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
                initialValue={prompts.reel[fieldName] ?? DEFAULT_PROMPT_FIELD}
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
