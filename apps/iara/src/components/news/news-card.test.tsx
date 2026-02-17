import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test-utils'

import { NewsCard } from './news-card'
import type { News } from '@/types/news'

function createTimestamp(date: Date) {
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0,
  }
}

const mockNews: News = {
  id: 'news-1',
  titulo: 'Depurando com IA: Ela Pode Substituir um Desenvolvedor Experiente?',
  descricao: 'Um desenvolvedor testou a IA Claude em bugs de React/Next.js.',
  resumo: 'Resumo completo da notícia',
  comentarios: 'Comentários sobre a notícia',
  data: '2026-02-09',
  fonte: {
    nome: 'Developer Way',
    url: 'https://www.developerway.com/posts/debugging-with-ai',
  },
  importedAt: createTimestamp(new Date('2026-02-09T18:55:00Z')),
}

describe('NewsCard', () => {
  it('renders title and description', () => {
    render(<NewsCard news={mockNews} isSelected={false} onSelect={vi.fn()} />)

    expect(screen.getByText(mockNews.titulo)).toBeInTheDocument()
    expect(screen.getByText(mockNews.descricao)).toBeInTheDocument()
  })

  it('renders source name and date', () => {
    render(<NewsCard news={mockNews} isSelected={false} onSelect={vi.fn()} />)

    expect(screen.getByText('Developer Way')).toBeInTheDocument()
    expect(screen.getByText('2026-02-09')).toBeInTheDocument()
  })

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn()
    render(<NewsCard news={mockNews} isSelected={false} onSelect={onSelect} />)

    fireEvent.click(screen.getByText(mockNews.titulo))

    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('applies selected styles when isSelected is true', () => {
    const { container } = render(
      <NewsCard news={mockNews} isSelected={true} onSelect={vi.fn()} />
    )

    const card = container.querySelector('[data-slot="card"]')
    expect(card?.className).toContain('border-primary')
  })
})
