'use client'

import { useState } from 'react'
import { InfoIcon, Loader2 } from 'lucide-react'

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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Video } from '@/types/video'

interface StandaloneToggleProps {
  video: Video
  /**
   * Persists the new flag value (PUT /standalone) and refreshes the workspace.
   * Enabling clears the parent link + inherited guests/theme. Should handle its
   * own errors (the toggle only awaits it to drive the saving state).
   */
  onToggle: (next: boolean) => Promise<void>
  className?: string
}

/**
 * Toggle for the editorial `standalone` flag (Epic 25 Bloco B). Only meaningful
 * for cut/reel videos (episodes are out of scope) — renders nothing otherwise.
 *
 * Turning it ON discards the parent episode + inherited guests/theme, so it is
 * gated behind an AlertDialog (shadcn — never the native confirm()). Turning it
 * OFF just flips the flag (the parent-selection phase reappears in the wizard).
 */
export function StandaloneToggle({ video, onToggle, className }: StandaloneToggleProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Standalone only applies to cut/reel (duration-based formats without an episode).
  if (video.videoType !== 'cut' && video.videoType !== 'reel') {
    return null
  }

  const isOn = video.standalone === true

  async function persist(next: boolean) {
    setSaving(true)
    try {
      await onToggle(next)
    } finally {
      setSaving(false)
    }
  }

  function handleCheckedChange(next: boolean) {
    if (next) {
      // Enabling is destructive (clears parent/guests/theme) → confirm first.
      setConfirmOpen(true)
    } else {
      void persist(false)
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Switch
        id="standalone-toggle"
        checked={isOn}
        onCheckedChange={handleCheckedChange}
        disabled={saving}
        aria-label="Vídeo avulso"
      />
      <Label htmlFor="standalone-toggle" className="text-sm text-muted-foreground cursor-pointer">
        Vídeo avulso
      </Label>
      {saving && <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-muted-foreground/70 hover:text-muted-foreground"
              aria-label="O que é vídeo avulso?"
            >
              <InfoIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Marque para vídeos que não são do podcast (notícia, recado aos ouvintes).
            Sem episódio pai: pula a seleção de pai e as fases de análise, indo direto
            ao título/descrição/tags.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como vídeo avulso?</AlertDialogTitle>
            <AlertDialogDescription>
              Vídeos avulsos não têm episódio pai. Ao confirmar, o vínculo com o
              episódio pai e os convidados/tema herdados dele serão removidos deste
              vídeo, e as fases de seleção de pai e de análise saem do fluxo. Você pode
              desfazer desligando a opção (a seleção de pai reaparece).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void persist(true)} disabled={saving}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
