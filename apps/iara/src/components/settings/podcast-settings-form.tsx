'use client'

import { useState } from 'react'
import { z } from 'zod'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAutoSave } from '@/hooks/use-auto-save'
import { log } from '@/lib/logger'
import type { SerializedPodcast } from '@/app/settings/page'

/**
 * Client-side validation schemas for individual fields.
 * Validates before sending to API (enforcement rule #2).
 */
const NameSchema = z.string().min(1, 'Nome é obrigatório')
const ChannelIdSchema = z.string().min(1, 'Channel ID é obrigatório')

/**
 * Updates podcast via API route (server-side).
 */
async function updatePodcastViaApi(data: { name?: string; channelId?: string }): Promise<void> {
  const response = await fetch('/api/podcast', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Erro ao salvar')
  }
}

interface PodcastSettingsFormProps {
  podcast: SerializedPodcast
}

/**
 * Client component for editing podcast settings.
 *
 * Features:
 * - Auto-save with 1.5s debounce
 * - Zod validation before saving
 * - Save status indicators (saving/saved/error)
 * - Immediate save on blur
 */
export function PodcastSettingsForm({ podcast }: PodcastSettingsFormProps) {
  const [name, setName] = useState(podcast.name)
  const [channelId, setChannelId] = useState(podcast.channelId)
  const [nameError, setNameError] = useState<string | null>(null)
  const [channelIdError, setChannelIdError] = useState<string | null>(null)

  const {
    saveStatus: nameSaveStatus,
    save: saveName,
  } = useAutoSave(
    name,
    async (value) => {
      setNameError(null)
      // Client-side Zod validation (AC5)
      const result = NameSchema.safeParse(value)
      if (!result.success) {
        const message = result.error.issues[0]?.message || 'Valor inválido'
        setNameError(message)
        throw new Error(message)
      }
      try {
        await updatePodcastViaApi({ name: value })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar'
        setNameError(message)
        log('ERROR', 'Failed to save podcast name', {
          podcastId: podcast.id,
          error: message,
        })
        throw err
      }
    },
    1500
  )

  const {
    saveStatus: channelIdSaveStatus,
    save: saveChannelId,
  } = useAutoSave(
    channelId,
    async (value) => {
      setChannelIdError(null)
      // Client-side Zod validation (AC5)
      const result = ChannelIdSchema.safeParse(value)
      if (!result.success) {
        const message = result.error.issues[0]?.message || 'Valor inválido'
        setChannelIdError(message)
        throw new Error(message)
      }
      try {
        await updatePodcastViaApi({ channelId: value })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar'
        setChannelIdError(message)
        log('ERROR', 'Failed to save podcast channelId', {
          podcastId: podcast.id,
          error: message,
        })
        throw err
      }
    },
    1500
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informações do Podcast</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Nome do Podcast</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => saveName()}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'name-error' : undefined}
          />
          <div className="flex items-center justify-between">
            {nameError ? (
              <p id="name-error" className="text-xs text-destructive">
                {nameError}
              </p>
            ) : (
              <SaveStatusIndicator status={nameSaveStatus} />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="channelId">Channel ID do YouTube</Label>
          <Input
            id="channelId"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            onBlur={() => saveChannelId()}
            aria-invalid={!!channelIdError}
            aria-describedby={channelIdError ? 'channelId-error' : undefined}
          />
          <div className="flex items-center justify-between">
            {channelIdError ? (
              <p id="channelId-error" className="text-xs text-destructive">
                {channelIdError}
              </p>
            ) : (
              <SaveStatusIndicator status={channelIdSaveStatus} />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ownerId">Owner ID</Label>
          <Input
            id="ownerId"
            value={podcast.ownerId}
            disabled
            className="bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            O Owner ID é definido automaticamente
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

interface SaveStatusIndicatorProps {
  status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
}

function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
  if (status === 'pending') {
    return <p className="text-xs text-amber-500">Alterações pendentes...</p>
  }
  if (status === 'saving') {
    return <p className="text-xs text-muted-foreground">Salvando...</p>
  }
  if (status === 'saved') {
    return <p className="text-xs text-green-500">Salvo</p>
  }
  return <span className="h-4" /> // Placeholder to maintain layout
}
