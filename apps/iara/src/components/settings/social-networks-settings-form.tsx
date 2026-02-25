'use client'

import { useState } from 'react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { log } from '@/lib/logger'

interface SocialNetworksSettingsFormProps {
  socialNetworks: Array<{ id: string; name: string; icon: string }>
  enabledNetworks: string[]
  onSave: (enabledNetworks: string[]) => Promise<void>
}

/**
 * Settings form for enabling/disabling individual social networks per podcast.
 * Saves immediately on toggle change with optimistic update and rollback on error.
 */
export function SocialNetworksSettingsForm({ socialNetworks, enabledNetworks, onSave }: SocialNetworksSettingsFormProps) {
  const [enabled, setEnabled] = useState<string[]>(enabledNetworks)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleToggle(networkId: string, checked: boolean) {
    const previous = enabled
    const updated = checked
      ? [...enabled, networkId]
      : enabled.filter(id => id !== networkId)

    setEnabled(updated)
    setSaving(true)
    setError(null)

    try {
      await onSave(updated)
    } catch (err) {
      setEnabled(previous)
      const message = err instanceof Error ? err.message : 'Erro ao salvar'
      setError(message)
      log('ERROR', 'Failed to save enabled social networks', { networkId, error: message })
    } finally {
      setSaving(false)
    }
  }

  if (socialNetworks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma rede social disponível no catálogo.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Selecione as redes sociais para as quais deseja gerar posts.
      </p>

      <div className="space-y-4">
        {socialNetworks.map((network) => (
          <div key={network.id} className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={`network-${network.id}`} className="text-sm font-medium">
                {network.icon} {network.name}
              </Label>
            </div>
            <Switch
              id={`network-${network.id}`}
              checked={enabled.includes(network.id)}
              onCheckedChange={(checked) => handleToggle(network.id, checked)}
              disabled={saving}
            />
          </div>
        ))}
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
