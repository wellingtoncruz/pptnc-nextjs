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

type VideoTypeChoice = 'episode' | 'cut' | 'reel'

const TYPE_LABELS: Record<VideoTypeChoice, string> = {
  episode: 'Episódio',
  cut: 'Corte',
  reel: 'Reel',
}

/** O que a confirmação vai executar — as duas ações destrutivas do avulso. */
type PendingAction =
  | { kind: 'enable' }
  | { kind: 'disable' }
  | { kind: 'reclassify'; videoType: VideoTypeChoice }

interface StandaloneToggleProps {
  video: Video
  /**
   * Persists the new flag value (PUT /standalone) and refreshes the workspace.
   * Enabling clears the parent link + inherited guests/theme. Disabling (adendo
   * do Epic 25) returns the type to the duration one and PURGES the wizard.
   * Should handle its own errors (the toggle only awaits it for the saving state).
   */
  onToggle: (next: boolean) => Promise<void>
  /**
   * Reclassificação manual do avulso (PUT /video-type) — adendo do Epic 25.
   * Espurga o wizard. Sem o handler, o seletor de tipo não aparece.
   */
  onReclassify?: (videoType: VideoTypeChoice) => Promise<void>
  className?: string
}

/** Texto comum das confirmações que espurgam — o produtor precisa saber o que perde. */
const PURGE_WARNING =
  'O wizard deste vídeo recomeça do zero: tudo o que ele gerou (análises, títulos, título curto, capítulos, links, thumbnail e imagens extras) é apagado, e título, descrição e tags voltam a ser os que estão no YouTube agora. Não dá para desfazer.'

/**
 * Toggle for the editorial `standalone` flag (Epic 25 Bloco B) + seletor de
 * tipo do avulso (adendo do Epic 25, 2026-09-27).
 *
 * Um vídeo só VIRA avulso sendo corte ou reel pela duração; já avulso, o tipo é
 * livre (episódio roda o wizard completo) — então o controle aparece para
 * corte/reel e para qualquer avulso, inclusive o reclassificado como episódio.
 *
 * As três ações são destrutivas e passam por AlertDialog (shadcn — nunca o
 * confirm() nativo): marcar descarta o pai + convidados/tema herdados;
 * desmarcar e reclassificar ESPURGAM o wizard.
 */
export function StandaloneToggle({ video, onToggle, onReclassify, className }: StandaloneToggleProps) {
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [saving, setSaving] = useState(false)

  const isOn = video.standalone === true
  if (!isOn && video.videoType !== 'cut' && video.videoType !== 'reel') {
    return null
  }

  async function run(action: PendingAction) {
    setSaving(true)
    try {
      if (action.kind === 'reclassify') await onReclassify?.(action.videoType)
      else await onToggle(action.kind === 'enable')
    } finally {
      setSaving(false)
    }
  }

  function handleCheckedChange(next: boolean) {
    setPending({ kind: next ? 'enable' : 'disable' })
  }

  const dialog =
    pending?.kind === 'enable'
      ? {
          title: 'Marcar como vídeo avulso?',
          body: 'Vídeos avulsos não têm episódio pai. Ao confirmar, o vínculo com o episódio pai e os convidados/tema herdados dele serão removidos deste vídeo, e as fases de seleção de pai e de análise saem do fluxo.',
        }
      : pending?.kind === 'disable'
        ? {
            title: 'Deixar de ser avulso?',
            body: `O tipo volta a ser o definido pela duração do vídeo. ${PURGE_WARNING}`,
          }
        : pending?.kind === 'reclassify'
          ? {
              title: `Reclassificar como ${TYPE_LABELS[pending.videoType]}?`,
              body: PURGE_WARNING,
            }
          : null

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
            Marque para vídeos que não são do podcast (notícia, recado aos ouvintes,
            pocket-episódio). Avulso não tem episódio pai nem filhos, e o tipo pode ser
            escolhido: Episódio roda o wizard completo; Corte e Reel, o simplificado.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isOn && onReclassify && (
        <div
          role="group"
          aria-label="Tipo do vídeo avulso"
          className="ml-2 inline-flex rounded-md border border-border bg-background p-0.5"
        >
          {(Object.keys(TYPE_LABELS) as VideoTypeChoice[]).map((type) => {
            const active = video.videoType === type
            return (
              <button
                key={type}
                type="button"
                aria-pressed={active}
                disabled={saving || active}
                onClick={() => setPending({ kind: 'reclassify', videoType: type })}
                className={cn(
                  'rounded px-2.5 py-0.5 text-xs transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {TYPE_LABELS[type]}
              </button>
            )
          })}
        </div>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialog?.body}</AlertDialogDescription>
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
