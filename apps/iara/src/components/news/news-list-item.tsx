'use client'

import { cn } from '@/lib/utils'
import type { News } from '@/types/news'

interface NewsListItemProps {
  news: News
  isSelected: boolean
  onSelect: () => void
}

export function NewsListItem({ news, isSelected, onSelect }: NewsListItemProps) {
  // importedAt arrives as ISO string from the API (converted from Firestore Timestamp server-side)
  const displayDate = news.importedAt
    ? new Date(news.importedAt as unknown as string).toLocaleDateString('pt-BR')
    : ''

  return (
    <div
      className={cn(
        'flex flex-col gap-1 px-4 py-2.5 cursor-pointer transition-colors hover:bg-accent/50',
        isSelected && 'bg-accent border-l-2 border-primary'
      )}
      data-selected={isSelected ? 'true' : undefined}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3">
        <span className="font-semibold text-sm truncate flex-1">{news.titulo}</span>
        {news.fonte.nome && (
          <span className="text-xs text-muted-foreground shrink-0">{news.fonte.nome}</span>
        )}
        {displayDate && (
          <span className="text-xs text-muted-foreground shrink-0">{displayDate}</span>
        )}
      </div>
      {news.descricao && (
        <p className="text-xs text-muted-foreground line-clamp-3">{news.descricao}</p>
      )}
    </div>
  )
}
