'use client'

import { useCallback, useRef, useEffect } from 'react'

import { Radio, ToggleLeft, Cpu, Share2, Clock, Bot, FileText, Newspaper, RefreshCw } from 'lucide-react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { PodcastSettingsForm } from './podcast-settings-form'
import { FeaturesSettingsForm } from './features-settings-form'
import { LlmConfigSettingsForm } from './llm-config-settings-form'
import { PromptsSettingsForm } from './prompts-settings-form'
import { PersonasSettingsForm } from './personas-settings-form'
import { DurationSettingsForm } from './duration-settings-form'
import { SocialNetworksSettingsForm } from './social-networks-settings-form'
import { SocialPublishSettings } from './social-publish-settings'
import { ResyncSection } from './resync-section'
import { PromptFieldEditor } from './prompt-field-editor'
import { useAccordionState } from '@/hooks/use-accordion-state'
import { log } from '@/lib/logger'
import { DEFAULT_PROMPT_FIELD, DEFAULT_EPISODE_PROMPTS } from '@/lib/schemas'
import type { SerializedPodcast, PromptField, ThumbnailPromptField, Persona, PersonaKey, Prompts, Personas } from '@/types/podcast'

const DEFAULT_NEWSLETTER_PROMPTS = DEFAULT_EPISODE_PROMPTS.newsletter

/**
 * Section IDs for accordion persistence.
 */
const SECTION_IDS = {
  PODCAST: 'podcast',
  FEATURES: 'features',
  LLM_CONFIG: 'llm_config',
  SOCIAL_NETWORKS: 'social_networks',
  DURATION: 'duration',
  PERSONAS: 'personas',
  PROMPTS: 'prompts',
  PROMPTS_RESOURCES: 'prompts_resources',
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
  socialNetworks?: Array<{ id: string; name: string; icon: string }>
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
export function SettingsPageClient({ podcast, socialNetworks }: SettingsPageClientProps) {
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
      videoType: 'episode' | 'cut' | 'reel' | 'standalone',
      fieldName: string,
      value: PromptField
    ) => {
      // Update ref immediately to capture this change for subsequent saves
      const currentPrompts = promptsRef.current
      // The standalone bucket (Epic 25) is optional — seed a full cut-shaped
      // default so the first edit produces a schema-valid bucket.
      const currentVideoType = currentPrompts[videoType] ?? {
        titles: DEFAULT_PROMPT_FIELD,
        thumbs: DEFAULT_PROMPT_FIELD,
        description: DEFAULT_PROMPT_FIELD,
        tags: DEFAULT_PROMPT_FIELD,
      }
      let updatedVideoType

      if (fieldName.startsWith('social.')) {
        const networkId = fieldName.slice('social.'.length)
        const currentSocial = currentVideoType.social ?? {}
        updatedVideoType = {
          ...currentVideoType,
          social: { ...currentSocial, [networkId]: value },
        }
      } else if (fieldName.startsWith('newsletter.')) {
        const sectionKey = fieldName.slice('newsletter.'.length)
        const currentNewsletter = (currentVideoType as { newsletter?: Record<string, unknown> }).newsletter ?? DEFAULT_NEWSLETTER_PROMPTS
        updatedVideoType = {
          ...currentVideoType,
          newsletter: { ...currentNewsletter, [sectionKey]: value },
        }
      } else {
        updatedVideoType = {
          ...currentVideoType,
          [fieldName]: value,
        }
      }

      const updatedPrompts = {
        ...currentPrompts,
        [videoType]: updatedVideoType,
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

  const handleSaveThumbnailPromptField = useCallback(
    async (videoType: 'episode' | 'cut', value: ThumbnailPromptField) => {
      const currentPrompts = promptsRef.current
      const currentVideoType = currentPrompts[videoType]
      const updatedPrompts = {
        ...currentPrompts,
        [videoType]: {
          ...currentVideoType,
          thumbnail: value,
        },
      }
      promptsRef.current = updatedPrompts

      const response = await fetch('/api/podcast', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts: updatedPrompts,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        const message = error?.error?.message || 'Erro ao salvar configuração de thumbnail'
        log('ERROR', 'Failed to save thumbnail prompt field', { videoType, error: message })
        throw new Error(message)
      }
    },
    []
  )

  const handleSaveNewsPrompt = useCallback(
    async (fieldName: string, value: PromptField) => {
      const currentPrompts = promptsRef.current
      const currentNews = currentPrompts.news ?? {}
      const updatedPrompts = {
        ...currentPrompts,
        news: { ...currentNews, [fieldName]: value },
      }
      promptsRef.current = updatedPrompts

      const response = await fetch('/api/podcast', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompts: updatedPrompts,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        const message = error?.error?.message || 'Erro ao salvar prompt de notícias'
        log('ERROR', 'Failed to save news prompt field', { fieldName, error: message })
        throw new Error(message)
      }
    },
    [] // No dependencies - uses refs instead
  )

  const handleSavePersona = useCallback(
    async (personaKey: PersonaKey, value: Persona) => {
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

  const handleSaveEnabledNetworks = useCallback(
    async (enabledSocialNetworks: string[]) => {
      const response = await fetch('/api/podcast', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledSocialNetworks }),
      })
      if (!response.ok) {
        const error = await response.json()
        const message = error?.error?.message || 'Erro ao salvar'
        log('ERROR', 'Failed to save enabled social networks', { error: message })
        throw new Error(message)
      }
    },
    []
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
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-start gap-3">
            <Radio className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <div className="text-lg font-semibold">Informações do Podcast</div>
              <div className="text-sm font-normal text-muted-foreground">Nome, canal do YouTube e nome do host</div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <PodcastSettingsForm podcast={podcast} />
        </AccordionContent>
      </AccordionItem>

      {/* Features Settings */}
      <AccordionItem value={SECTION_IDS.FEATURES} className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-start gap-3">
            <ToggleLeft className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <div className="text-lg font-semibold">Recursos</div>
              <div className="text-sm font-normal text-muted-foreground">Habilite ou desabilite seções opcionais da aplicação</div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <FeaturesSettingsForm features={{
            editorial: podcast.features?.editorial ?? true,
            news: podcast.features?.news ?? true,
            includeLivestreams: podcast.features?.includeLivestreams ?? false,
            socialMedia: podcast.features?.socialMedia ?? false,
            adwords: podcast.features?.adwords ?? false,
            newsletter: podcast.features?.newsletter ?? false,
            llmDebugMode: podcast.features?.llmDebugMode ?? false,
            socialPublish: podcast.features?.socialPublish ?? false,
            thumbnailGeneration: podcast.features?.thumbnailGeneration ?? false,
          }} />
        </AccordionContent>
      </AccordionItem>

      {/* LLM Config Settings */}
      <AccordionItem value={SECTION_IDS.LLM_CONFIG} className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-start gap-3">
            <Cpu className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <div className="text-lg font-semibold">Modelo LLM</div>
              <div className="text-sm font-normal text-muted-foreground">Modelos Gemini para geração de texto e imagens</div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <LlmConfigSettingsForm llmConfig={podcast.llmConfig} />
        </AccordionContent>
      </AccordionItem>

      {/* Social Networks Settings (conditional on socialMedia OR socialPublish) */}
      {(podcast.features?.socialMedia || podcast.features?.socialPublish) && (
        <AccordionItem value={SECTION_IDS.SOCIAL_NETWORKS} className="border rounded-lg">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-start gap-3">
              <Share2 className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="text-left">
                <div className="text-lg font-semibold">Redes Sociais</div>
                <div className="text-sm font-normal text-muted-foreground">Habilitação de redes e conexão de contas</div>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6 space-y-8">
            {/* Sub-section 1: Enable/disable networks */}
            {podcast.features?.socialMedia && socialNetworks && (
              <div>
                <h3 className="text-sm font-semibold mb-3">Habilitar Redes Sociais</h3>
                <SocialNetworksSettingsForm
                  socialNetworks={socialNetworks}
                  enabledNetworks={podcast.enabledSocialNetworks ?? []}
                  onSave={handleSaveEnabledNetworks}
                />
              </div>
            )}
            {/* Sub-section 2: Connect accounts for publishing */}
            {podcast.features?.socialPublish && (
              <div>
                <h3 className="text-sm font-semibold mb-3">Conectar Redes Sociais</h3>
                <SocialPublishSettings />
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      )}

      {/* Duration Settings */}
      <AccordionItem value={SECTION_IDS.DURATION} className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <div className="text-lg font-semibold">Duração por Tipo de Vídeo</div>
              <div className="text-sm font-normal text-muted-foreground">Limites de duração para classificação de vídeos</div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <DurationSettingsForm videoTypes={podcast.videoTypes} onSave={handleSaveVideoTypes} />
        </AccordionContent>
      </AccordionItem>

      {/* Personas Settings */}
      <AccordionItem value={SECTION_IDS.PERSONAS} className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-start gap-3">
            <Bot className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <div className="text-lg font-semibold">Personas do LLM</div>
              <div className="text-sm font-normal text-muted-foreground">Configure os personagens que o LLM assume em cada tarefa</div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent forceOverflow className="px-6 pb-6">
          <PersonasSettingsForm personas={podcast.personas} onSavePersona={handleSavePersona} />
        </AccordionContent>
      </AccordionItem>

      {/* Prompts Settings */}
      <AccordionItem value={SECTION_IDS.PROMPTS} className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <div className="text-lg font-semibold">Prompts por Tipo de Vídeo</div>
              <div className="text-sm font-normal text-muted-foreground">Instruções enviadas ao LLM para cada fase por tipo de vídeo</div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent forceOverflow className="px-6 pb-6">
          <PromptsSettingsForm
            prompts={podcast.prompts}
            enabledSocialNetworks={podcast.enabledSocialNetworks ?? []}
            socialNetworks={socialNetworks ?? []}
            onSavePromptField={handleSavePromptField}
            onSaveThumbnailPromptField={handleSaveThumbnailPromptField}
          />
        </AccordionContent>
      </AccordionItem>

      {/* Resource Prompts (News) - separate panel at same level */}
      {(podcast.features?.news ?? true) && (
        <AccordionItem value={SECTION_IDS.PROMPTS_RESOURCES} className="border rounded-lg">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-start gap-3">
              <Newspaper className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="text-left">
                <div className="text-lg font-semibold">Prompts por Recurso</div>
                <div className="text-sm font-normal text-muted-foreground">Prompts de recursos como Notícias</div>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent forceOverflow className="px-6 pb-6">
            <div className="space-y-4">
              <div className="text-sm font-medium text-muted-foreground">Notícias</div>
              <PromptFieldEditor
                fieldKey="news-news_social"
                label="Redação Rede Social"
                initialValue={podcast.prompts.news?.news_social ?? DEFAULT_PROMPT_FIELD}
                onSave={(value) => handleSaveNewsPrompt('news_social', value)}
              />
              <PromptFieldEditor
                fieldKey="news-news_image"
                label="Imagem"
                initialValue={podcast.prompts.news?.news_image ?? DEFAULT_PROMPT_FIELD}
                onSave={(value) => handleSaveNewsPrompt('news_image', value)}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      )}

      {/* Sync Settings */}
      <AccordionItem value={SECTION_IDS.SYNC} className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-start gap-3">
            <RefreshCw className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="text-left">
              <div className="text-lg font-semibold">Sincronização</div>
              <div className="text-sm font-normal text-muted-foreground">Re-importar vídeos do canal YouTube</div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <ResyncSection />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
