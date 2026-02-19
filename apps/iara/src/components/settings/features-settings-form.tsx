'use client'

import { useState } from 'react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { log } from '@/lib/logger'

interface PodcastFeatures {
  editorial: boolean
  news: boolean
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
 * Settings form for feature toggles.
 * Toggles editorial and news sections on/off.
 * Saves immediately on toggle change.
 */
export function FeaturesSettingsForm({ features }: FeaturesSettingsFormProps) {
  const [editorial, setEditorial] = useState(features.editorial)
  const [news, setNews] = useState(features.news)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleToggle(key: 'editorial' | 'news', value: boolean) {
    const updated = { editorial, news, [key]: value }

    if (key === 'editorial') setEditorial(value)
    else setNews(value)

    setError(null)
    setSaving(true)

    try {
      await updateFeaturesViaApi(updated)
    } catch (err) {
      // Revert on failure
      if (key === 'editorial') setEditorial(!value)
      else setNews(!value)
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
