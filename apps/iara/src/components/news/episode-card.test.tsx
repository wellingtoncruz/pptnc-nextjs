import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EpisodeCard } from './episode-card'
import type { VideoSummary } from '@/types/video'

vi.mock('@/components/ui/video-thumbnail', () => ({
  VideoThumbnail: ({ alt }: { alt: string }) => <div data-testid="video-thumbnail">{alt}</div>,
}))

const baseEpisode: VideoSummary = {
  id: 'ep-1',
  title: 'Como IA está mudando tudo',
  description: 'Uma análise profunda sobre o impacto da IA nos negócios',
  duration: 4923,
  status: 'ready',
  videoType: 'episode',
  guests: [
    { name: 'João Silva', role: 'CEO', linkedin: 'https://linkedin.com/in/joao' },
    { name: 'Maria Santos', role: 'CTO', linkedin: 'https://linkedin.com/in/maria' },
  ],
  thumbnails: {
    high: { url: 'https://img.youtube.com/vi/ep-1/hqdefault.jpg' },
  },
}

describe('EpisodeCard', () => {
  it('renders episode title and description', () => {
    render(<EpisodeCard episode={baseEpisode} isSelected={false} onClick={vi.fn()} />)

    // Title appears in both thumbnail (alt) and card heading
    expect(screen.getAllByText('Como IA está mudando tudo').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Uma análise profunda sobre o impacto da IA nos negócios')).toBeInTheDocument()
  })

  it('renders guest names', () => {
    render(<EpisodeCard episode={baseEpisode} isSelected={false} onClick={vi.fn()} />)

    expect(screen.getByText('João Silva, Maria Santos')).toBeInTheDocument()
  })

  it('renders formatted duration', () => {
    render(<EpisodeCard episode={baseEpisode} isSelected={false} onClick={vi.fn()} />)

    // 4923 seconds = 1:22:03
    expect(screen.getByText('1:22:03')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<EpisodeCard episode={baseEpisode} isSelected={false} onClick={onClick} />)

    await user.click(screen.getByTestId('episode-card-ep-1'))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('applies selected styles when isSelected is true', () => {
    render(<EpisodeCard episode={baseEpisode} isSelected={true} onClick={vi.fn()} />)

    const button = screen.getByTestId('episode-card-ep-1')
    expect(button.className).toContain('border-primary')
  })

  it('hides guests when not available', () => {
    const noGuests = { ...baseEpisode, guests: undefined }
    render(<EpisodeCard episode={noGuests} isSelected={false} onClick={vi.fn()} />)

    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })

  it('hides duration when zero', () => {
    const noDuration = { ...baseEpisode, duration: 0 }
    render(<EpisodeCard episode={noDuration} isSelected={false} onClick={vi.fn()} />)

    expect(screen.queryByText('0:00')).not.toBeInTheDocument()
  })

  it('renders thumbnail with correct alt', () => {
    render(<EpisodeCard episode={baseEpisode} isSelected={false} onClick={vi.fn()} />)

    expect(screen.getByTestId('video-thumbnail')).toHaveTextContent('Como IA está mudando tudo')
  })
})
