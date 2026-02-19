'use client'

import { useState } from 'react'
import { z } from 'zod'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAutoSave } from '@/hooks/use-auto-save'
import { log } from '@/lib/logger'
import { MAX_YOUTUBE_FOOTER_LENGTH } from '@/lib/schemas/podcast'
import type { SerializedPodcast } from '@/types/podcast'

/**
 * Client-side validation schemas for individual fields.
 * Validates before sending to API (enforcement rule #2).
 */
const NameSchema = z.string().min(1, 'Nome é obrigatório')
const ChannelIdSchema = z.string().min(1, 'Channel ID é obrigatório')
const HostNameSchema = z.string().max(200, 'Nome do host deve ter no máximo 200 caracteres').optional()
const YoutubeFooterSchema = z.string().max(MAX_YOUTUBE_FOOTER_LENGTH, `Rodapé deve ter no máximo ${MAX_YOUTUBE_FOOTER_LENGTH} caracteres`).optional()

/**
 * Updates podcast via API route (server-side).
 */
async function updatePodcastViaApi(data: { name?: string; channelId?: string; hostName?: string; youtubeFooter?: string }): Promise<void> {
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
 *
 * Note: Title is rendered by parent AccordionTrigger.
 * @see docs/stories/8-2-secoes-colapsaveis.md
 */
export function PodcastSettingsForm({ podcast }: PodcastSettingsFormProps) {
  const [name, setName] = useState(podcast.name)
  const [channelId, setChannelId] = useState(podcast.channelId)
  const [hostName, setHostName] = useState(podcast.hostName ?? '')
  const [youtubeFooter, setYoutubeFooter] = useState(podcast.youtubeFooter ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [channelIdError, setChannelIdError] = useState<string | null>(null)
  const [hostNameError, setHostNameError] = useState<string | null>(null)
  const [youtubeFooterError, setYoutubeFooterError] = useState<string | null>(null)

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

  const {
    saveStatus: hostNameSaveStatus,
    save: saveHostName,
  } = useAutoSave(
    hostName,
    async (value) => {
      setHostNameError(null)
      const result = HostNameSchema.safeParse(value)
      if (!result.success) {
        const message = result.error.issues[0]?.message || 'Valor inválido'
        setHostNameError(message)
        throw new Error(message)
      }
      try {
        await updatePodcastViaApi({ hostName: value || undefined })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar'
        setHostNameError(message)
        log('ERROR', 'Failed to save podcast hostName', {
          podcastId: podcast.id,
          error: message,
        })
        throw err
      }
    },
    1500
  )

  const {
    saveStatus: youtubeFooterSaveStatus,
    save: saveYoutubeFooter,
  } = useAutoSave(
    youtubeFooter,
    async (value) => {
      setYoutubeFooterError(null)
      // Client-side Zod validation (AC5)
      const result = YoutubeFooterSchema.safeParse(value)
      if (!result.success) {
        const message = result.error.issues[0]?.message || 'Valor inválido'
        setYoutubeFooterError(message)
        throw new Error(message)
      }
      try {
        await updatePodcastViaApi({ youtubeFooter: value || undefined })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar'
        setYoutubeFooterError(message)
        log('ERROR', 'Failed to save podcast youtubeFooter', {
          podcastId: podcast.id,
          error: message,
        })
        throw err
      }
    },
    1500
  )

  return (
    <div className="space-y-6">
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

      <div className="space-y-2">
        <Label htmlFor="hostName">Nome do Host/Apresentador</Label>
        <Input
          id="hostName"
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
          onBlur={() => saveHostName()}
          placeholder="Nome do apresentador do podcast"
          aria-invalid={!!hostNameError}
          aria-describedby={hostNameError ? 'hostName-error' : 'hostName-description'}
        />
        <div className="flex items-center justify-between">
          {hostNameError ? (
            <p id="hostName-error" className="text-xs text-destructive">
              {hostNameError}
            </p>
          ) : (
            <SaveStatusIndicator status={hostNameSaveStatus} />
          )}
        </div>
        <p id="hostName-description" className="text-xs text-muted-foreground">
          O nome do host será incluído nas descrições geradas pela IA.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="youtubeFooter">Rodapé do YouTube</Label>
        <Textarea
          id="youtubeFooter"
          value={youtubeFooter}
          onChange={(e) => setYoutubeFooter(e.target.value)}
          onBlur={() => saveYoutubeFooter()}
          placeholder="Texto que será adicionado ao final das descrições dos vídeos..."
          rows={6}
          aria-invalid={!!youtubeFooterError}
          aria-describedby={youtubeFooterError ? 'youtubeFooter-error' : 'youtubeFooter-description'}
        />
        <div className="flex items-center justify-between">
          {youtubeFooterError ? (
            <p id="youtubeFooter-error" className="text-xs text-destructive">
              {youtubeFooterError}
            </p>
          ) : (
            <SaveStatusIndicator status={youtubeFooterSaveStatus} />
          )}
          <span className="text-xs text-muted-foreground">
            {youtubeFooter.length}/{MAX_YOUTUBE_FOOTER_LENGTH}
          </span>
        </div>
        <p id="youtubeFooter-description" className="text-xs text-muted-foreground">
          Este texto será adicionado automaticamente ao final das descrições geradas para os vídeos.
        </p>
      </div>
    </div>
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
