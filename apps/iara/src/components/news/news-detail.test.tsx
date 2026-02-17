import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test-utils'

import { NewsDetail } from './news-detail'
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
  titulo: 'Depurando com IA',
  descricao: 'Descrição curta',
  resumo: 'Resumo completo da notícia sobre IA e depuração',
  comentarios: 'Comentários analíticos sobre o tema',
  data: '2026-02-09',
  fonte: {
    nome: 'Developer Way',
    url: 'https://www.developerway.com/posts/debugging-with-ai',
  },
  importedAt: createTimestamp(new Date('2026-02-09T18:55:00Z')),
}

describe('NewsDetail', () => {
  it('shows empty state when news is null', () => {
    render(<NewsDetail news={null} />)

    expect(screen.getByText(/selecione uma notícia/i)).toBeInTheDocument()
  })

  it('renders title', () => {
    render(<NewsDetail news={mockNews} />)

    expect(screen.getByText('Depurando com IA')).toBeInTheDocument()
  })

  it('renders date and source with link', () => {
    render(<NewsDetail news={mockNews} />)

    expect(screen.getByText('2026-02-09')).toBeInTheDocument()
    const link = screen.getByText('Developer Way')
    expect(link.closest('a')).toHaveAttribute('href', mockNews.fonte.url)
    expect(link.closest('a')).toHaveAttribute('target', '_blank')
    expect(link.closest('a')).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders descricao section', () => {
    render(<NewsDetail news={mockNews} />)

    expect(screen.getByText('Descrição')).toBeInTheDocument()
    expect(screen.getByText(mockNews.descricao)).toBeInTheDocument()
  })

  it('renders resumo section', () => {
    render(<NewsDetail news={mockNews} />)

    expect(screen.getByText('Resumo')).toBeInTheDocument()
    expect(screen.getByText(mockNews.resumo)).toBeInTheDocument()
  })

  it('renders comentarios section', () => {
    render(<NewsDetail news={mockNews} />)

    expect(screen.getByText('Comentários')).toBeInTheDocument()
    expect(screen.getByText(mockNews.comentarios)).toBeInTheDocument()
  })

  it('hides empty sections when fields are empty strings', () => {
    const partialNews: News = {
      ...mockNews,
      descricao: '',
      resumo: '',
      comentarios: '',
    }
    render(<NewsDetail news={partialNews} />)

    expect(screen.getByText('Depurando com IA')).toBeInTheDocument()
    expect(screen.queryByText('Descrição')).not.toBeInTheDocument()
    expect(screen.queryByText('Resumo')).not.toBeInTheDocument()
    expect(screen.queryByText('Comentários')).not.toBeInTheDocument()
  })

  it('renders source name without link when url is empty', () => {
    const noUrlNews: News = {
      ...mockNews,
      fonte: { nome: 'Source Name', url: '' },
    }
    render(<NewsDetail news={noUrlNews} />)

    expect(screen.getByText('Source Name')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
