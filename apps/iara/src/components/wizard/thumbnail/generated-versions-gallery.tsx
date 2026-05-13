'use client'

import { cn } from '@/lib/utils'

/**
 * One thumbnail version produced by Caminho 1 (Gerar com IAra) during the
 * current wizard session. Versions are kept in component state only — they
 * are not persisted to Firestore yet (Story 22.3g covers persistence of the
 * final pick). The producer regenera ilimitadamente e cada chamada adiciona
 * uma nova entrada, sem substituir as anteriores.
 */
export interface GeneratedThumbnailVersion {
  /** Unique id for the React key — survives reorder/insert. */
  id: string
  /** URL (data: ou https://) que vai pra `<img src>` da miniatura e do summary. */
  url: string
  /** Texto livre que o produtor escreveu antes de clicar Gerar. Undefined = não preencheu. */
  observation: string | undefined
  /** Quando a geração concluiu (cliente — Story 22.4 trocará pelo timestamp do server). */
  timestamp: Date
}

interface GeneratedVersionsGalleryProps {
  versions: GeneratedThumbnailVersion[]
  /** URL atualmente selecionada (vem do estado pai). Usada para destacar a miniatura ativa. */
  selectedUrl: string | undefined
  /** Disparado ao clicar numa miniatura — pai atualiza a seleção. */
  onSelect: (url: string) => void
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
  className,
}: GeneratedVersionsGalleryProps) {
  if (versions.length === 0) return null

  return (
    <div
      className={cn('rounded-md border bg-muted/30 p-4', className)}
      data-testid="generated-versions-gallery"
    >
      <p className="text-sm font-medium mb-3">
        Versões geradas ({versions.length})
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
}

function VersionCard({ version, isSelected, onClick }: VersionCardProps) {
  const observationLabel = version.observation?.trim()
    ? truncate(version.observation.trim(), 48)
    : 'Sem observação'

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="version-card"
      data-version-id={version.id}
      data-selected={isSelected ? 'true' : 'false'}
      className={cn(
        'flex flex-col gap-1 shrink-0 rounded-md border-2 p-1 text-left transition-colors',
        'hover:border-primary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected ? 'border-primary' : 'border-transparent'
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
