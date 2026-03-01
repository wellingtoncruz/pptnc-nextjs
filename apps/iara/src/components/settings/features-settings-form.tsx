'use client'

import { useState } from 'react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { log } from '@/lib/logger'

interface PodcastFeatures {
  editorial: boolean
  news: boolean
  includeLivestreams: boolean
  socialMedia: boolean
  adwords: boolean
  newsletter: boolean
  llmDebugMode: boolean
}

interface FeaturesSettingsFormProps {
  features: PodcastFeatures
}

async function updateFeaturesViaApi(features: PodcastFeatures): Promise<void> {
  const response = await fetch('/api/podcast', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Erro ao salvar')
  }
}

/**
 * Settings form for feature toggles (editorial, news, includeLivestreams, socialMedia, adwords, newsletter, llmDebugMode).
 * Saves immediately on toggle change with optimistic update and rollback on error.
 */
export function FeaturesSettingsForm({ features }: FeaturesSettingsFormProps) {
  const [editorial, setEditorial] = useState(features.editorial)
  const [news, setNews] = useState(features.news)
  const [includeLivestreams, setIncludeLivestreams] = useState(features.includeLivestreams)
  const [socialMedia, setSocialMedia] = useState(features.socialMedia)
  const [adwords, setAdwords] = useState(features.adwords)
  const [newsletter, setNewsletter] = useState(features.newsletter)
  const [llmDebugMode, setLlmDebugMode] = useState(features.llmDebugMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  type FeatureKey = 'editorial' | 'news' | 'includeLivestreams' | 'socialMedia' | 'adwords' | 'newsletter' | 'llmDebugMode'
  const setters: Record<FeatureKey, (v: boolean) => void> = {
    editorial: setEditorial,
    news: setNews,
    includeLivestreams: setIncludeLivestreams,
    socialMedia: setSocialMedia,
    adwords: setAdwords,
    newsletter: setNewsletter,
    llmDebugMode: setLlmDebugMode,
  }

  async function handleToggle(key: FeatureKey, value: boolean) {
    const updated = { editorial, news, includeLivestreams, socialMedia, adwords, newsletter, llmDebugMode, [key]: value }

    setters[key](value)

    setError(null)
    setSaving(true)

    try {
      await updateFeaturesViaApi(updated)
    } catch (err) {
      // Revert on failure
      setters[key](!value)
      const message = err instanceof Error ? err.message : 'Erro ao salvar'
      setError(message)
      log('ERROR', 'Failed to save features', { key, error: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Habilite ou desabilite seções opcionais do menu lateral.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="feature-editorial">Editorial</Label>
            <p className="text-xs text-muted-foreground">
              Seção de relatórios editoriais dos episódios
            </p>
          </div>
          <Switch
            id="feature-editorial"
            checked={editorial}
            onCheckedChange={(value) => handleToggle('editorial', value)}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="feature-news">Notícias</Label>
            <p className="text-xs text-muted-foreground">
              Seção de curadoria de notícias
            </p>
          </div>
          <Switch
            id="feature-news"
            checked={news}
            onCheckedChange={(value) => handleToggle('news', value)}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="feature-includeLivestreams">Incluir vídeos de lives</Label>
            <p className="text-xs text-muted-foreground">
              Incluir na sincronização vídeos gerados a partir de transmissões ao vivo
            </p>
          </div>
          <Switch
            id="feature-includeLivestreams"
            checked={includeLivestreams}
            onCheckedChange={(value) => handleToggle('includeLivestreams', value)}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="feature-socialMedia">Redes Sociais</Label>
            <p className="text-xs text-muted-foreground">
              Habilita a seção de posts para redes sociais no menu lateral.
            </p>
          </div>
          <Switch
            id="feature-socialMedia"
            checked={socialMedia}
            onCheckedChange={(value) => handleToggle('socialMedia', value)}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="feature-adwords">Tráfego Pago</Label>
            <p className="text-xs text-muted-foreground">
              Habilita a aba Tráfego Pago para geração de guias de otimização AdWords
            </p>
          </div>
          <Switch
            id="feature-adwords"
            checked={adwords}
            onCheckedChange={(value) => handleToggle('adwords', value)}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="feature-newsletter">Newsletter</Label>
            <p className="text-xs text-muted-foreground">
              Geração de newsletter a partir dos episódios
            </p>
          </div>
          <Switch
            id="feature-newsletter"
            checked={newsletter}
            onCheckedChange={(value) => handleToggle('newsletter', value)}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="feature-llmDebugMode">Modo de Depuração LLM</Label>
            <p className="text-xs text-muted-foreground">
              Registra prompts e respostas do LLM para análise e otimização
            </p>
          </div>
          <Switch
            id="feature-llmDebugMode"
            checked={llmDebugMode}
            onCheckedChange={(value) => handleToggle('llmDebugMode', value)}
            disabled={saving}
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {saving && (
        <p className="text-xs text-muted-foreground">Salvando...</p>
      )}
    </div>
  )
}
