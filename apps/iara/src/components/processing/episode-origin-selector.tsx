'use client'

import { useState } from 'react'
import { AlertCircleIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ContextInputsPreview } from './context-inputs-preview'
import type { VideoSummary } from '@/types/video'

interface EpisodeOriginSelectorProps {
  /** Available episodes with context inputs */
  availableEpisodes: VideoSummary[]
  /** Currently selected episode ID */
  selectedEpisodeId?: string
  /** Callback when episode is selected and confirmed */
  onSubmit: (episodeId: string) => void
  /** Callback when cancel is clicked */
  onCancel: () => void
  /** Whether the form is submitting */
  isSubmitting?: boolean
}

/**
 * Selector for choosing parent episode for cut/reel processing.
 *
 * Shows:
 * - Dropdown with available episodes (only those with contextInputs)
 * - Preview of selected episode's context
 * - Empty state when no episodes available
 */
export function EpisodeOriginSelector({
  availableEpisodes,
  selectedEpisodeId,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: EpisodeOriginSelectorProps) {
  const [selectedId, setSelectedId] = useState<string>(selectedEpisodeId ?? '')

  // Find selected episode and its context
  const selectedEpisode = availableEpisodes.find((ep) => ep.id === selectedId)

  // No episodes available
  if (availableEpisodes.length === 0) {
    return (
      <div className="py-8 text-center space-y-4">
        <div className="flex justify-center">
          <AlertCircleIcon className="size-12 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Nenhum episódio com contexto disponível</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Para processar um corte ou reel, primeiro processe um episódio completo.
            O contexto do episódio será herdado automaticamente.
          </p>
        </div>
        <Button variant="outline" onClick={onCancel}>
          Voltar para a Lista
        </Button>
      </div>
    )
  }

  const handleSubmit = () => {
    if (selectedId) {
      onSubmit(selectedId)
    }
  }

  return (
    <div className="space-y-6">
      {/* Episode Selector */}
      <div className="space-y-2">
        <Label htmlFor="episode-select">
          Episódio de Origem <span className="text-destructive">*</span>
        </Label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger id="episode-select">
            <SelectValue placeholder="Selecione um episódio..." />
          </SelectTrigger>
          <SelectContent>
            {availableEpisodes.map((episode) => (
              <SelectItem key={episode.id} value={episode.id}>
                {episode.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          O contexto deste episódio será usado para gerar os metadados.
        </p>
      </div>

      {/* Context Preview */}
      {selectedEpisode && (
        <ContextInputsPreview
          episodeId={selectedId}
          episodeTitle={selectedEpisode.title}
          preloadedTheme={selectedEpisode.theme}
          preloadedGuests={selectedEpisode.guests}
        />
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={!selectedId || isSubmitting}>
          {isSubmitting ? 'Salvando...' : 'Iniciar Processamento'}
        </Button>
      </div>
    </div>
  )
}
