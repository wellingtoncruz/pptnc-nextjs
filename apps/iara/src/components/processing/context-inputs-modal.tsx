'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ContextInputsForm } from './context-inputs-form'
import { EpisodeOriginSelector } from './episode-origin-selector'
import type { EpisodeContextFormData, VideoType, VideoSummary, Guest } from '@/types/video'

/**
 * Data submitted from the modal.
 * For episodes: theme + guests (coHost merged into guests[0])
 * For cuts/reels: parentEpisodeId only
 */
export type ContextSubmitData = {
  theme?: string
  guests?: Guest[]
  parentEpisodeId?: string
}

interface ContextInputsModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Callback to close the modal */
  onOpenChange: (open: boolean) => void
  /** Type of video being processed */
  videoType: VideoType
  /** Title of the video (for display) */
  videoTitle: string
  /** Existing theme (for editing) */
  existingTheme?: string
  /** Existing guests (for editing) - guests[0] is coHost if present */
  existingGuests?: Guest[]
  /** Existing parentEpisodeId (for cuts/reels) */
  existingParentEpisodeId?: string
  /** Available episodes with context (for cut/reel) */
  availableEpisodes?: VideoSummary[]
  /** Callback when context is submitted */
  onSubmit: (data: ContextSubmitData) => void
  /** Whether the form is submitting */
  isSubmitting?: boolean
}

/**
 * Modal for collecting context inputs before AI processing.
 *
 * - For episodes: Shows form with theme, co-host, guests
 * - For cuts/reels: Shows episode selector to inherit context
 */
export function ContextInputsModal({
  open,
  onOpenChange,
  videoType,
  videoTitle,
  existingTheme,
  existingGuests,
  existingParentEpisodeId,
  availableEpisodes = [],
  onSubmit,
  isSubmitting = false,
}: ContextInputsModalProps) {
  const isEpisode = videoType === 'episode'

  // Convert existing guests to form format (separate coHost from guests)
  // Convention: guests[0] is always the co-host when present (has non-empty name)
  const getFormDefaults = (): Partial<EpisodeContextFormData> | undefined => {
    if (!existingTheme && !existingGuests?.length) return undefined

    // If guests[0] exists with a non-empty name, treat it as co-host
    // Note: An empty-named guest at [0] is considered invalid data and ignored
    const firstGuest = existingGuests?.[0]
    const hasCoHost = !!(firstGuest?.name && firstGuest.name.trim().length > 0)
    const coHost = hasCoHost ? firstGuest : undefined
    const remainingGuests = hasCoHost ? existingGuests!.slice(1) : existingGuests

    return {
      theme: existingTheme,
      hasCoHost,
      coHost,
      guests: remainingGuests?.length ? remainingGuests : undefined,
    }
  }

  const handleEpisodeSubmit = (data: EpisodeContextFormData) => {
    // Merge coHost into guests[0] if present
    const allGuests: Guest[] = []
    if (data.hasCoHost && data.coHost?.name) {
      allGuests.push(data.coHost)
    }
    allGuests.push(...data.guests)

    onSubmit({
      theme: data.theme,
      guests: allGuests,
    })
  }

  const handleCutReelSubmit = (parentEpisodeId: string) => {
    onSubmit({ parentEpisodeId })
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEpisode ? 'Informações do Episódio' : 'Selecionar Episódio de Origem'}
          </DialogTitle>
          <DialogDescription>
            {isEpisode
              ? 'Preencha as informações sobre o episódio para que a IA possa gerar metadados de qualidade.'
              : `Selecione o episódio de origem para o ${videoType === 'cut' ? 'corte' : 'reel'}.`}
          </DialogDescription>
          <p className="text-sm text-muted-foreground mt-1 truncate">
            Vídeo: <span className="font-medium">{videoTitle}</span>
          </p>
        </DialogHeader>

        {isEpisode ? (
          <ContextInputsForm
            defaultValues={getFormDefaults()}
            onSubmit={handleEpisodeSubmit}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
          />
        ) : (
          <EpisodeOriginSelector
            availableEpisodes={availableEpisodes}
            selectedEpisodeId={existingParentEpisodeId}
            onSubmit={handleCutReelSubmit}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
