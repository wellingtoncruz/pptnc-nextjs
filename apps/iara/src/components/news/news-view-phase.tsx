'use client'

import { ExternalLink, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { News } from '@/types/news'

interface NewsViewPhaseProps {
  news: News
  onFindEpisodes: () => void
}

export function NewsViewPhase({ news, onFindEpisodes }: NewsViewPhaseProps) {
  const displayDate = news.data
    ? new Date(news.data + 'T00:00:00').toLocaleDateString('pt-BR')
    : ''

  return (
    <div className="flex h-full flex-col" data-testid="news-view-phase">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {/* Title and metadata */}
        <div>
          <h2 className="text-xl font-semibold leading-tight">{news.titulo}</h2>
          <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
            {displayDate && <span>{displayDate}</span>}
            {displayDate && news.fonte.nome && <span>&middot;</span>}
            {news.fonte.url ? (
              <a
                href={news.fonte.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                {news.fonte.nome || 'Fonte'}
                <ExternalLink className="size-3" />
              </a>
            ) : news.fonte.nome ? (
              <span>{news.fonte.nome}</span>
            ) : null}
          </div>
        </div>

        {news.descricao && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Descrição</h3>
            <p className="text-sm leading-relaxed whitespace-pre-line">{news.descricao}</p>
          </div>
        )}

        {news.resumo && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Resumo</h3>
            <p className="text-sm leading-relaxed whitespace-pre-line">{news.resumo}</p>
          </div>
        )}

        {news.comentarios && (
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Comentários</h3>
            <p className="text-sm leading-relaxed whitespace-pre-line">{news.comentarios}</p>
          </div>
        )}
      </div>

      {/* Action button */}
      <div className="shrink-0 border-t border-border px-6 py-4">
        <Button onClick={onFindEpisodes} className="w-full" data-testid="find-episodes-button">
          <Search className="mr-2 size-4" />
          Procurar episódios que falem do tema
        </Button>
      </div>
    </div>
  )
}
