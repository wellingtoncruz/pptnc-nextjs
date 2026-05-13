'use client'

import { Maximize2 } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * One thumbnail version no histórico da sessão atual. Pode ter vindo de:
 * - **Gerar com IAra** (Caminho 1, Story 22.3c — stub; 22.4 — real generation)
 * - **Upload manual** (Caminho 2, Story 22.3e)
 *
 * Versions são mantidas só no estado do componente — Story 22.3g cuida da
 * persistência da escolha final em `video.storageThumbnailUrl`. O produtor
 * pode acumular ilimitadamente sem perder versões anteriores.
 */
export interface GeneratedThumbnailVersion {
  /** Unique id for the React key — survives reorder/insert. */
  id: string
  /** URL (data: ou https://) que vai pra `<img src>` da miniatura e do summary. */
  url: string
  /** Texto livre que o produtor escreveu antes de clicar Gerar. Undefined = não preencheu / não se aplica. */
  observation: string | undefined
  /** Quando a versão entrou no histórico (cliente — Story 22.4 trocará pelo timestamp do server). */
  timestamp: Date
  /**
   * Origem da versão. Determina o label exibido sob a miniatura quando o
   * produtor não digitou observação ("Sem observação" vs "Upload manual").
   */
  source: 'generated' | 'upload'
}

interface GeneratedVersionsGalleryProps {
  versions: GeneratedThumbnailVersion[]
  /** URL atualmente selecionada (vem do estado pai). Usada para destacar a miniatura ativa. */
  selectedUrl: string | undefined
  /** Disparado ao clicar numa miniatura — pai atualiza a seleção. */
  onSelect: (url: string) => void
  /**
   * Disparado ao clicar no ícone Expand sobre uma miniatura — pai abre o
   * lightbox para a URL passada **sem alterar a seleção**. Opcional para
   * preservar compatibilidade com testes legados.
   */
  onPreview?: (url: string) => void
  className?: string
}

/**
 * Histórico de versões geradas na sessão atual — Epic 22 / Story 22.3d.
 *
 * Cada miniatura mostra a thumbnail gerada, a observação usada (truncada)
 * e o timestamp relativo ("agora", "há 30s", "há 5min"). Clicar troca a
 * versão selecionada sem perder o histórico — assim o produtor pode comparar
 * gerações e voltar pra uma anterior sem ter de regenerar.
 *
 * Não renderiza nada quando `versions` está vazio — o pai cuida disso, mas
 * dobramos a checagem aqui pra evitar acidentes.
 */
export function GeneratedVersionsGallery({
  versions,
  selectedUrl,
  onSelect,
  onPreview,
  className,
}: GeneratedVersionsGalleryProps) {
  if (versions.length === 0) return null

  return (
    <div
      className={cn('rounded-md border bg-muted/30 p-4', className)}
      data-testid="generated-versions-gallery"
    >
      <p className="text-sm font-medium mb-3">
        Versões ({versions.length})
      </p>
      <div
        className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar"
        role="list"
        aria-label="Histórico de thumbnails geradas"
      >
        {versions.map((version) => (
          <VersionCard
            key={version.id}
            version={version}
            isSelected={version.url === selectedUrl}
            onClick={() => onSelect(version.url)}
            onPreview={onPreview ? () => onPreview(version.url) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

interface VersionCardProps {
  version: GeneratedThumbnailVersion
  isSelected: boolean
  onClick: () => void
  /** Quando definido, mostra ícone Expand sobre a miniatura que abre o lightbox sem alterar a seleção. */
  onPreview?: () => void
}

function VersionCard({ version, isSelected, onClick, onPreview }: VersionCardProps) {
  const trimmedObservation = version.observation?.trim()
  const observationLabel = trimmedObservation
    ? truncate(trimmedObservation, 48)
    : version.source === 'upload'
      ? 'Upload manual'
      : 'Sem observação'

  return (
    <div
      data-testid="version-card"
      data-version-id={version.id}
      data-selected={isSelected ? 'true' : 'false'}
      className={cn(
        'relative flex flex-col gap-1 shrink-0 rounded-md border-2 transition-colors',
        isSelected ? 'border-primary' : 'border-transparent'
      )}
    >
      <button
        type="button"
        onClick={onClick}
        data-testid="version-select-button"
        className={cn(
          'flex flex-col gap-1 rounded-md p-1 text-left',
          'hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
        aria-pressed={isSelected}
        aria-label={`Selecionar versão gerada — ${observationLabel}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={version.url}
          alt={`Versão gerada ${observationLabel}`}
          className="h-20 w-36 rounded border bg-muted object-cover"
        />
        <p className="w-36 text-xs text-foreground truncate" title={observationLabel}>
          {observationLabel}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {formatRelativeTime(version.timestamp)}
        </p>
      </button>
      {onPreview && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onPreview()
          }}
          data-testid="version-preview-button"
          className={cn(
            'absolute right-1 top-1 rounded bg-background/80 p-1 backdrop-blur',
            'hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
          aria-label={`Ver versão gerada em tamanho real — ${observationLabel}`}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

/**
 * Relative time formatter for the gallery — keeps the gallery readable without
 * pulling in a full date library. The wizard sessions are short so we never
 * need anything beyond a few hours.
 */
export function formatRelativeTime(timestamp: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - timestamp.getTime()
  if (diffMs < 5000) return 'agora'
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `há ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `há ${minutes}min`
  const hours = Math.floor(minutes / 60)
  return `há ${hours}h`
}
