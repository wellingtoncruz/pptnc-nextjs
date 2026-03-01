import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test-utils'

import { NewsListItem } from './news-list-item'
import type { News } from '@/types/news'

// importedAt arrives as ISO string from the API (serialized from Firestore Timestamp)
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
  importedAt: '2026-02-09T18:55:00.000Z' as unknown as News['importedAt'],
}

describe('NewsListItem', () => {
  it('renders title and description', () => {
    render(<NewsListItem news={mockNews} isSelected={false} onSelect={vi.fn()} />)

    expect(screen.getByText(mockNews.titulo)).toBeInTheDocument()
    expect(screen.getByText(mockNews.descricao)).toBeInTheDocument()
  })

  it('renders source name and date from importedAt ISO string', () => {
    render(<NewsListItem news={mockNews} isSelected={false} onSelect={vi.fn()} />)

    expect(screen.getByText('Developer Way')).toBeInTheDocument()
    // importedAt "2026-02-09T18:55:00.000Z" → pt-BR locale: 09/02/2026
    expect(screen.getByText(/09\/02\/2026/)).toBeInTheDocument()
  })

  it('calls onSelect when clicked', () => {
    const onSelect = vi.fn()
    render(<NewsListItem news={mockNews} isSelected={false} onSelect={onSelect} />)

    fireEvent.click(screen.getByText(mockNews.titulo))

    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('applies selected styles when isSelected is true', () => {
    render(<NewsListItem news={mockNews} isSelected={true} onSelect={vi.fn()} />)

    const item = screen.getByText(mockNews.titulo).closest('[data-selected]')
    expect(item).toBeInTheDocument()
    expect(item).toHaveAttribute('data-selected', 'true')
  })

  it('does not apply selected styles when isSelected is false', () => {
    render(<NewsListItem news={mockNews} isSelected={false} onSelect={vi.fn()} />)

    const titleEl = screen.getByText(mockNews.titulo)
    const item = titleEl.closest('[data-selected]')
    expect(item).toBeNull()
  })

  it('renders without fonte.nome when empty', () => {
    const newsWithoutFonte: News = {
      ...mockNews,
      fonte: { nome: '', url: '' },
    }
    const { container } = render(
      <NewsListItem news={newsWithoutFonte} isSelected={false} onSelect={vi.fn()} />
    )

    expect(screen.getByText(mockNews.titulo)).toBeInTheDocument()
    // fonte.nome empty → span not rendered (no invisible spacer)
    const spans = container.querySelectorAll('span')
    const fonteSpan = Array.from(spans).find(s => s.textContent === '')
    expect(fonteSpan).toBeUndefined()
  })

  it('renders with default catch values', () => {
    const newsDefaults: News = {
      ...mockNews,
      titulo: 'Sem título',
      descricao: '',
      fonte: { nome: '', url: '' },
    }
    render(<NewsListItem news={newsDefaults} isSelected={false} onSelect={vi.fn()} />)

    expect(screen.getByText('Sem título')).toBeInTheDocument()
    expect(screen.getByText(/09\/02\/2026/)).toBeInTheDocument()
  })

  it('renders empty date when importedAt is missing', () => {
    const newsNoDate: News = {
      ...mockNews,
      importedAt: undefined as unknown as News['importedAt'],
    }
    const { container } = render(
      <NewsListItem news={newsNoDate} isSelected={false} onSelect={vi.fn()} />
    )

    expect(screen.getByText(mockNews.titulo)).toBeInTheDocument()
    // No date span should be rendered
    const spans = container.querySelectorAll('span')
    const dateSpan = Array.from(spans).find(s => /\d{2}\/\d{2}\/\d{4}/.test(s.textContent ?? ''))
    expect(dateSpan).toBeUndefined()
  })
})
