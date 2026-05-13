'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface ThumbnailLightboxProps {
  /** URL da imagem para exibir em tamanho real. `null` significa lightbox fechado. */
  url: string | null
  /** Disparado quando o produtor fecha o lightbox (ESC, overlay ou botão X). */
  onClose: () => void
  /** Label acessível opcional — usado pra leitor de tela; default genérico. */
  label?: string
}

/**
 * Lightbox para visualizar uma thumbnail em tamanho real — Epic 22 / Story 22.3d.
 *
 * O componente é controlado: o pai mantém o `url` em estado e passa `null`
 * pra fechar. Usa o `Dialog` do shadcn (Radix por baixo) — ESC, click no
 * overlay e botão X já estão wired pelo primitive.
 *
 * Pra a fase Thumbnail, o lightbox é gatilhado clicando na imagem dentro de
 * "Thumbnail selecionada" ou no ícone Expand sobre cada miniatura da galeria.
 * O objetivo é permitir avaliar qualidade/composição da imagem sem precisar
 * abrir em outra aba.
 */
export function ThumbnailLightbox({ url, onClose, label }: ThumbnailLightboxProps) {
  return (
    <Dialog
      open={url !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="max-w-[min(96vw,1400px)] p-2 sm:max-w-[min(96vw,1400px)]"
        data-testid="thumbnail-lightbox"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{label ?? 'Thumbnail em tamanho real'}</DialogTitle>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label ?? 'Thumbnail em tamanho real'}
            className="mx-auto max-h-[85vh] w-auto object-contain rounded"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
