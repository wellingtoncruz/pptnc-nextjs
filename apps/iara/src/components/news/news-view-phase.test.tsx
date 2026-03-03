import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NewsViewPhase } from './news-view-phase'

const mockTimestamp = { toDate: () => new Date('2026-03-01'), toMillis: () => 0, seconds: 0, nanoseconds: 0 }

const mockNews = {
  id: 'news-1',
  titulo: 'IA revoluciona o mercado',
  descricao: 'Novas ferramentas surgem',
  resumo: 'Resumo da notícia',
  comentarios: 'Especialistas comentam',
  data: '2026-03-01',
  fonte: { nome: 'TechCrunch', url: 'https://techcrunch.com' },
  importedAt: mockTimestamp as never,
}

describe('NewsViewPhase', () => {
  it('renders news title and fields', () => {
    render(<NewsViewPhase news={mockNews} onFindEpisodes={vi.fn()} />)

    expect(screen.getByText('IA revoluciona o mercado')).toBeInTheDocument()
    expect(screen.getByText('Novas ferramentas surgem')).toBeInTheDocument()
    expect(screen.getByText('Resumo da notícia')).toBeInTheDocument()
    expect(screen.getByText('Especialistas comentam')).toBeInTheDocument()
  })

  it('renders formatted date from news.data field', () => {
    render(<NewsViewPhase news={mockNews} onFindEpisodes={vi.fn()} />)

    // 2026-03-01 formatted in pt-BR
    expect(screen.getByText('01/03/2026')).toBeInTheDocument()
  })

  it('renders source with link', () => {
    render(<NewsViewPhase news={mockNews} onFindEpisodes={vi.fn()} />)

    const link = screen.getByText('TechCrunch')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', 'https://techcrunch.com')
  })

  it('renders find episodes button', () => {
    render(<NewsViewPhase news={mockNews} onFindEpisodes={vi.fn()} />)

    expect(screen.getByTestId('find-episodes-button')).toBeInTheDocument()
    expect(screen.getByText('Procurar episódios que falem do tema')).toBeInTheDocument()
  })

  it('calls onFindEpisodes when button is clicked', async () => {
    const user = userEvent.setup()
    const onFindEpisodes = vi.fn()
    render(<NewsViewPhase news={mockNews} onFindEpisodes={onFindEpisodes} />)

    await user.click(screen.getByTestId('find-episodes-button'))

    expect(onFindEpisodes).toHaveBeenCalledOnce()
  })

  it('hides empty optional fields', () => {
    const minimalNews = {
      ...mockNews,
      descricao: '',
      resumo: '',
      comentarios: '',
      fonte: { nome: '', url: '' },
    }

    render(<NewsViewPhase news={minimalNews} onFindEpisodes={vi.fn()} />)

    expect(screen.queryByText('Descrição')).not.toBeInTheDocument()
    expect(screen.queryByText('Resumo')).not.toBeInTheDocument()
    expect(screen.queryByText('Comentários')).not.toBeInTheDocument()
  })
})
