'use client'

import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import type { Video } from '@/types/video'

import {
  NEEDS_PARENT_NOTE,
  PURGE_WARNING,
  REEL_TO_EPISODE_NOTE,
  VIDEO_TYPE_LABELS,
  type VideoTypeChoice,
} from './video-type-labels'

interface VideoTypeControlProps {
  video: Video
  /** PUT /video-type — espurga o wizard. Deve tratar os próprios erros. */
  onReclassify: (videoType: VideoTypeChoice) => Promise<void>
  className?: string
}

/**
 * Seletor de tipo do vídeo — Epic 25, Adendo B (2026-10-02).
 *
 * O tipo nasce da duração; o produtor corrige quando a régua erra. Só é
 * renderizado para vídeos elegíveis (avulso, ou sem pai e sem filhos) — quem
 * decide é o pai. Separado do toggle "Vídeo avulso": reclassificar NÃO torna
 * o vídeo avulso.
 */
export function VideoTypeControl({ video, onReclassify, className }: VideoTypeControlProps) {
  const [pending, setPending] = useState<VideoTypeChoice | null>(null)
  const [saving, setSaving] = useState(false)

  async function run(videoType: VideoTypeChoice) {
    setSaving(true)
    try {
      await onReclassify(videoType)
    } finally {
      setSaving(false)
    }
  }

  const notes = pending
    ? [
        PURGE_WARNING,
        !video.standalone && pending !== 'episode' ? NEEDS_PARENT_NOTE : null,
        video.videoType === 'reel' && pending === 'episode' ? REEL_TO_EPISODE_NOTE : null,
      ].filter(Boolean)
    : []

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-sm text-muted-foreground">Tipo</span>
      <div
        role="group"
        aria-label="Tipo do vídeo"
        className="inline-flex rounded-md border border-border bg-background p-0.5"
      >
        {(Object.keys(VIDEO_TYPE_LABELS) as VideoTypeChoice[]).map((type) => {
          const active = video.videoType === type
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              disabled={saving || active}
              onClick={() => setPending(type)}
              className={cn(
                'rounded px-2.5 py-0.5 text-xs transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {VIDEO_TYPE_LABELS[type]}
            </button>
          )
        })}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending ? `Reclassificar como ${VIDEO_TYPE_LABELS[pending]}?` : ''}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) void run(pending)
                setPending(null)
              }}
              disabled={saving}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
