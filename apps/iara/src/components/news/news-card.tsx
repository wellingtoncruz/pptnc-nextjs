'use client'

import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { News } from '@/types/news'

interface NewsCardProps {
  news: News
  isSelected: boolean
  onSelect: () => void
}

export function NewsCard({ news, isSelected, onSelect }: NewsCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:bg-accent/50',
        isSelected && 'border-primary bg-accent'
      )}
      onClick={onSelect}
    >
      <CardHeader className="p-3 pb-1.5">
        <CardTitle className="line-clamp-2 text-sm">{news.titulo}</CardTitle>
        <CardDescription className="line-clamp-2 text-xs">
          {news.descricao}
        </CardDescription>
      </CardHeader>
      <CardFooter className="px-3 pb-2 pt-0">
        <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
          <span className="truncate max-w-[60%]">{news.fonte.nome}</span>
          <span className="shrink-0">{news.data}</span>
        </div>
      </CardFooter>
    </Card>
  )
}
