'use client'

import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EXTRA_IMAGE_KINDS, EXTRA_IMAGE_LABELS } from '@/lib/schemas/podcast'
import { cn } from '@/lib/utils'
import type { ExtraImages } from '@/types/video'

interface ExtraImagesDownloadsProps {
  extraImages?: ExtraImages
  className?: string
}

/**
 * Miniaturas + download das imagens extras já persistidas — Epic 28 / Story 28.6.
 *
 * Fica na coluna do vídeo, fora da fase Imagens Extras, para que o produtor
 * baixe Story/Vitrine/Feed de qualquer ponto do wizard sem voltar à fase que
 * as gerou (era o principal atrito de deixar o download só no step).
 *
 * Renderiza `null` quando não há nenhuma imagem — episódios que não usam a
 * feature não ganham espaço morto na tela.
 *
 * O atributo `download` funciona porque o proxy é same-origin e responde com
 * `Content-Type` de imagem: o browser salva em vez de navegar.
 */
export function ExtraImagesDownloads({ extraImages, className }: ExtraImagesDownloadsProps) {
  const available = EXTRA_IMAGE_KINDS.filter((kind) => Boolean(extraImages?.[kind]))
  if (available.length === 0) return null

  return (
    <div className={cn('rounded-md border p-3', className)} data-testid="extra-images-downloads">
      <p className="text-xs font-medium mb-2">Imagens extras</p>
      <div className="flex flex-wrap gap-3">
        {available.map((kind) => {
          const url = extraImages?.[kind] as string
          return (
            <div key={kind} className="flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={EXTRA_IMAGE_LABELS[kind]}
                className="h-16 w-auto rounded border bg-muted object-cover"
              />
              <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-[11px]">
                <a href={url} download={`${kind}.png`} data-testid={`download-panel-${kind}`}>
                  <Download className="h-3 w-3 mr-1" />
                  {EXTRA_IMAGE_LABELS[kind]}
                </a>
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
