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
import type { VideoRelations } from '@/lib/wizard/video-relations'
import type { Video } from '@/types/video'

import {
  NEEDS_PARENT_NOTE,
  PURGE_WARNING,
  VIDEO_TYPE_LABELS,
  type VideoTypeChoice,
} from './video-type-labels'

type PendingAction = { kind: 'enable' } | { kind: 'blocked' } | { kind: 'disable' }

interface StandaloneToggleProps {
  video: Video
  /**
   * Vínculos pai/filho (GET /relations). `null` enquanto carrega: marcar fica
   * travado até saber se há vínculo.
   */
  relations: VideoRelations | null
  /**
   * PUT /standalone. Marcar só vale sem vínculo; desmarcar leva o tipo
   * escolhido e ESPURGA o wizard. Deve tratar os próprios erros.
   */
  onToggle: (next: boolean, videoType?: VideoTypeChoice) => Promise<void>
  className?: string
}

function typeLabel(videoType?: string): string {
  return VIDEO_TYPE_LABELS[videoType as VideoTypeChoice] ?? 'Vídeo'
}

/**
 * Toggle da flag editorial `standalone` — Epic 25 (Bloco B; Adendos A e B).
 *
 * Avulso = vídeo que não se relaciona com nenhum outro (sem pai, sem filhos),
 * de qualquer tipo. Regras do Adendo B (2026-10-02):
 * - aparece para TODOS os vídeos;
 * - com vínculo, marcar é bloqueado, mas a opção continua visível e explica
 *   qual vínculo impede (não existe "desvincular": filhos são reapontados a
 *   outro episódio; corte/reel com pai nunca vira avulso);
 * - desmarcar obriga o produtor a escolher o tipo e espurga o wizard.
 *
 * O tipo em si é corrigido pelo `VideoTypeControl`, separado deste toggle.
 */
export function StandaloneToggle({ video, relations, onToggle, className }: StandaloneToggleProps) {
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [chosenType, setChosenType] = useState<VideoTypeChoice | null>(null)
  const [saving, setSaving] = useState(false)

  const isOn = video.standalone === true
  const linked = relations !== null && (relations.parent !== null || relations.children.length > 0)

  async function run(action: PendingAction, videoType: VideoTypeChoice | null) {
    if (action.kind === 'blocked') return
    if (action.kind === 'disable' && !videoType) return
    setSaving(true)
    try {
      if (action.kind === 'enable') await onToggle(true)
      else await onToggle(false, videoType ?? undefined)
    } finally {
      setSaving(false)
    }
  }

  function handleCheckedChange(next: boolean) {
    if (next) {
      setPending({ kind: linked ? 'blocked' : 'enable' })
    } else {
      setChosenType(null)
      setPending({ kind: 'disable' })
    }
  }

  function close() {
    setPending(null)
    setChosenType(null)
  }

  const enableBody =
    video.videoType === 'episode'
      ? 'Vídeo avulso não se relaciona com nenhum outro: este episódio não poderá receber cortes nem reels vinculados e sai da lista de episódios para vincular.'
      : 'Vídeo avulso não se relaciona com nenhum outro: não terá episódio pai, e as fases de seleção de pai e de análise saem do fluxo.'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Switch
        id="standalone-toggle"
        checked={isOn}
        onCheckedChange={handleCheckedChange}
        disabled={saving || (!isOn && relations === null)}
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
            Avulso é o vídeo que não se relaciona com nenhum outro: não tem episódio pai nem
            vídeos vinculados, e pode ser de qualquer tipo. Episódio roda o wizard completo;
            Corte e Reel, o simplificado.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && close()}>
        <AlertDialogContent>
          {pending?.kind === 'blocked' && relations && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Este vídeo não pode ser avulso</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    {relations.parent ? (
                      <p>
                        Ele está vinculado ao episódio <strong>{relations.parent.title}</strong>.
                        Vídeos vinculados a um episódio não podem ser avulsos.
                      </p>
                    ) : (
                      <>
                        <p>
                          {relations.children.length === 1
                            ? 'Ele tem 1 vídeo vinculado:'
                            : `Ele tem ${relations.children.length} vídeos vinculados:`}
                        </p>
                        <ul className="list-disc space-y-1 pl-5">
                          {relations.children.map((child) => (
                            <li key={child.id}>
                              <strong>{child.title}</strong> ({typeLabel(child.videoType)})
                            </li>
                          ))}
                        </ul>
                        <p>Aponte esses vídeos para outro episódio e tente de novo.</p>
                      </>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Fechar</AlertDialogCancel>
              </AlertDialogFooter>
            </>
          )}

          {pending?.kind === 'enable' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Marcar como vídeo avulso?</AlertDialogTitle>
                <AlertDialogDescription>{enableBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    void run(pending, chosenType)
                    close()
                  }}
                  disabled={saving}
                >
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}

          {pending?.kind === 'disable' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Deixar de ser avulso?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>Escolha o tipo do vídeo:</p>
                    <div
                      role="radiogroup"
                      aria-label="Tipo do vídeo ao deixar de ser avulso"
                      className="inline-flex rounded-md border border-border bg-background p-0.5"
                    >
                      {(Object.keys(VIDEO_TYPE_LABELS) as VideoTypeChoice[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          role="radio"
                          aria-checked={chosenType === type}
                          onClick={() => setChosenType(type)}
                          className={cn(
                            'rounded px-2.5 py-0.5 text-xs transition-colors',
                            chosenType === type
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {VIDEO_TYPE_LABELS[type]}
                        </button>
                      ))}
                    </div>
                    {chosenType && chosenType !== 'episode' && <p>{NEEDS_PARENT_NOTE}</p>}
                    <p>{PURGE_WARNING}</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    void run(pending, chosenType)
                    close()
                  }}
                  disabled={saving || chosenType === null}
                >
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
