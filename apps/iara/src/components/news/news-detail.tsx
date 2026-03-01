'use client'

import { ExternalLink } from 'lucide-react'

import type { News } from '@/types/news'

interface NewsDetailProps {
  news: News | null
}

export function NewsDetail({ news }: NewsDetailProps) {
  if (!news) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Selecione uma notícia para ver os detalhes</p>
      </div>
    )
  }

  // importedAt arrives as ISO string from the API (converted from Firestore Timestamp server-side)
  const displayDate = news.importedAt
    ? new Date(news.importedAt as unknown as string).toLocaleDateString('pt-BR')
    : ''

  return (
    <div className="space-y-6 p-6">
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
  )
}
