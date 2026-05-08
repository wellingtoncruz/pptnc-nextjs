import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test-utils'

import { EpisodeCard } from './episode-card'
import type { EpisodeSummary } from './episode-card'

const createMockEpisode = (overrides: Partial<EpisodeSummary> = {}): EpisodeSummary => ({
  id: 'video-123',
  title: 'Test Episode Title',
  description: 'A description of the episode for testing purposes.',
  status: 'sent',
  thumbnailUrl: 'https://img.youtube.com/vi/video-123/hqdefault.jpg',
  publishedAt: '2026-02-07T10:00:00Z',
  ...overrides,
})

describe('EpisodeCard', () => {
  it('renderiza título do episódio', () => {
    render(<EpisodeCard episode={createMockEpisode()} />)

    expect(screen.getByText('Test Episode Title')).toBeInTheDocument()
  })

  it('renderiza descrição truncada', () => {
    render(<EpisodeCard episode={createMockEpisode()} />)

    expect(screen.getByText('A description of the episode for testing purposes.')).toBeInTheDocument()
  })

  it('renderiza placeholder quando descrição está vazia', () => {
    render(<EpisodeCard episode={createMockEpisode({ description: undefined })} />)

    expect(screen.getByText('Sem descrição')).toBeInTheDocument()
  })

  it('renderiza badge de status com label correto', () => {
    render(<EpisodeCard episode={createMockEpisode({ status: 'draft' })} />)

    expect(screen.getByText('rascunho')).toBeInTheDocument()
  })

  it('renderiza badge de status sent com ícone check', () => {
    render(<EpisodeCard episode={createMockEpisode({ status: 'sent' })} />)

    expect(screen.getByText('enviado')).toBeInTheDocument()
  })

  it('renderiza link Relatório Editorial habilitado com href correto', () => {
    render(<EpisodeCard episode={createMockEpisode()} />)

    const link = screen.getByRole('link', { name: /relatório editorial/i })
    expect(link).toHaveAttribute('href', '/report/video-123')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('renderiza thumbnail com youtubeId correto', () => {
    render(<EpisodeCard episode={createMockEpisode()} />)

    const img = screen.getByRole('img', { name: 'Test Episode Title' })
    expect(img).toBeInTheDocument()
  })

  it('renderiza com status desconhecido sem erro', () => {
    render(<EpisodeCard episode={createMockEpisode({ status: 'unknown' })} />)

    expect(screen.getByText('unknown')).toBeInTheDocument()
  })
})
