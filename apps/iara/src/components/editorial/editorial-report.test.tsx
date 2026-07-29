import { describe, expect, it } from 'vitest'

import { render, screen } from '@/test-utils'

import { EditorialReport } from './editorial-report'
import type { Video } from '@/types/video'

const mockTimestamp = { toDate: () => new Date('2024-01-15') }

const createMockVideo = (overrides: Partial<Video> = {}): Video => ({
  id: 'episode-1',
  title: 'Episódio Teste: Como escalar apps',
  description: 'Uma descrição completa do episódio\ncom múltiplas linhas.',
  critique: 'Excelente episódio com conteúdo de alta qualidade.',
  duration: 3600,
  publishedAt: mockTimestamp,
  videoType: 'episode',
  podcastId: 'pptnc',
  status: 'sent',
  guests: [
    { name: 'João Silva', role: 'CTO', company: 'TechCorp', linkedin: 'https://linkedin.com/in/joao', photo: '/guests/joao.jpg' },
    { name: 'Maria Souza', role: 'Dev Lead', company: 'StartupX', linkedin: 'https://linkedin.com/in/maria' },
    { name: 'Pedro Santos', role: 'Arquiteto', linkedin: 'https://linkedin.com/in/pedro' },
  ],
  chapters: [
    { timestamp: '00:00', title: 'Introdução' },
    { timestamp: '05:30', title: 'Tema principal' },
    { timestamp: '45:00', title: 'Encerramento' },
  ],
  tags: ['tecnologia', 'escalabilidade', 'cloud'],
  ...overrides,
})

const createMockCut = (overrides: Partial<Video> = {}): Video => ({
  id: 'cut-1',
  title: 'Corte: Dica de escalabilidade',
  description: 'Descrição do corte.',
  shortTitle: 'ESCALABILIDADE',
  duration: 120,
  publishedAt: mockTimestamp,
  videoType: 'cut',
  podcastId: 'pptnc',
  status: 'draft',
  parentEpisodeId: 'episode-1',
  tags: ['dica', 'cloud'],
  ...overrides,
})

const createMockReel = (overrides: Partial<Video> = {}): Video => ({
  id: 'reel-1',
  title: 'Reel: Momento épico',
  description: 'Descrição do reel.',
  duration: 30,
  publishedAt: mockTimestamp,
  videoType: 'reel',
  podcastId: 'pptnc',
  status: 'draft',
  parentEpisodeId: 'episode-1',
  tags: ['viral'],
  ...overrides,
})

describe('EditorialReport', () => {
  it('renderiza título do episódio como h1', () => {
    render(<EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Episódio Teste: Como escalar apps')
  })

  it('renderiza crítica em bloco destacado', () => {
    render(<EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />)

    expect(screen.getByText('Excelente episódio com conteúdo de alta qualidade.')).toBeInTheDocument()
  })

  it('renderiza descrição do episódio', () => {
    render(<EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />)

    expect(screen.getByText(/Uma descrição completa do episódio/)).toBeInTheDocument()
  })

  it('renderiza todos os convidados igualmente', () => {
    render(<EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />)

    expect(screen.getByText('João Silva')).toBeInTheDocument()
    expect(screen.getByText('CTO · TechCorp')).toBeInTheDocument()
    expect(screen.queryByText('Co-host')).not.toBeInTheDocument()
  })

  it('renderiza avatar com foto e link direto para imagem', () => {
    render(<EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />)

    const img = screen.getByAltText('João Silva')
    expect(img).toHaveAttribute('src', '/guests/joao.jpg')

    // Photo wraps in a link that opens the image in a new tab
    const link = img.closest('a')
    expect(link).toHaveAttribute('href', '/guests/joao.jpg')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('renderiza iniciais quando guest não tem foto', () => {
    render(<EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />)

    // Maria Souza has no photo - should show initials "MS"
    expect(screen.getByText('MS')).toBeInTheDocument()
  })

  it('renderiza demais convidados em cards compactos', () => {
    render(<EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />)

    expect(screen.getByText('Maria Souza')).toBeInTheDocument()
    expect(screen.getByText('Pedro Santos')).toBeInTheDocument()
  })

  it('renderiza capítulos com timestamp e título', () => {
    render(<EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />)

    expect(screen.getByText('00:00')).toBeInTheDocument()
    expect(screen.getByText('Introdução')).toBeInTheDocument()
    expect(screen.getByText('05:30')).toBeInTheDocument()
    expect(screen.getByText('Tema principal')).toBeInTheDocument()
  })

  it('renderiza tags como badges', () => {
    render(<EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />)

    expect(screen.getByText('tecnologia')).toBeInTheDocument()
    expect(screen.getByText('escalabilidade')).toBeInTheDocument()
    expect(screen.getByText('cloud')).toBeInTheDocument()
  })

  it('renderiza youtubeFooter quando fornecido', () => {
    render(
      <EditorialReport
        video={createMockVideo()}
        cuts={[]}
        reels={[]}
        youtubeFooter="Inscreva-se no canal!"
      />
    )

    expect(screen.getByText('Inscreva-se no canal!')).toBeInTheDocument()
  })

  it('renderiza seção de cortes com shortTitle badge', () => {
    render(
      <EditorialReport
        video={createMockVideo()}
        cuts={[createMockCut()]}
        reels={[]}
      />
    )

    expect(screen.getByText('Cortes')).toBeInTheDocument()
    expect(screen.getByText('Corte: Dica de escalabilidade')).toBeInTheDocument()
    expect(screen.getByText('Título para thumb:')).toBeInTheDocument()
    expect(screen.getByText('ESCALABILIDADE')).toBeInTheDocument()
    expect(screen.getByText('Descrição do corte.')).toBeInTheDocument()
  })

  it('renderiza seção de reels', () => {
    render(
      <EditorialReport
        video={createMockVideo()}
        cuts={[]}
        reels={[createMockReel()]}
      />
    )

    expect(screen.getByText('Reels')).toBeInTheDocument()
    expect(screen.getByText('Reel: Momento épico')).toBeInTheDocument()
    expect(screen.getByText('Descrição do reel.')).toBeInTheDocument()
  })

  it('não renderiza seção de guests quando vazio', () => {
    render(
      <EditorialReport
        video={createMockVideo({ guests: [] })}
        cuts={[]}
        reels={[]}
      />
    )

    expect(screen.queryByText('Participantes')).not.toBeInTheDocument()
  })

  it('não renderiza seção de capítulos quando vazio', () => {
    render(
      <EditorialReport
        video={createMockVideo({ chapters: [] })}
        cuts={[]}
        reels={[]}
      />
    )

    expect(screen.queryByText('Capítulos')).not.toBeInTheDocument()
  })

  it('não renderiza seção de cortes quando vazio', () => {
    render(
      <EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />
    )

    expect(screen.queryByText('Cortes')).not.toBeInTheDocument()
  })

  it('não renderiza seção de reels quando vazio', () => {
    render(
      <EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />
    )

    expect(screen.queryByText('Reels')).not.toBeInTheDocument()
  })

  it('não renderiza crítica quando ausente', () => {
    render(
      <EditorialReport
        video={createMockVideo({ critique: undefined })}
        cuts={[]}
        reels={[]}
      />
    )

    // Should still render title and description
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renderiza links LinkedIn dos guests', () => {
    render(<EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />)

    const links = screen.getAllByText('LinkedIn')
    expect(links).toHaveLength(3) // co-host + 2 other guests
  })

  it('renderiza youtubeFooter em cada corte', () => {
    render(
      <EditorialReport
        video={createMockVideo()}
        cuts={[createMockCut(), createMockCut({ id: 'cut-2', title: 'Corte 2' })]}
        reels={[]}
        youtubeFooter="Footer YouTube"
      />
    )

    // Footer appears: once in episode section + once per cut
    const footers = screen.getAllByText('Footer YouTube')
    expect(footers.length).toBeGreaterThanOrEqual(3) // episode + 2 cuts
  })

  it('renderiza tags dos cortes', () => {
    render(
      <EditorialReport
        video={createMockVideo({ tags: [] })}
        cuts={[createMockCut()]}
        reels={[]}
      />
    )

    expect(screen.getByText('dica')).toBeInTheDocument()
  })

  describe('imagens do episódio', () => {
    const thumbUrl = `/api/wizard/thumbnail/select?path=${encodeURIComponent('thumbnails/pptnc/episode-1/final-1.png')}`
    const storyUrl = `/api/wizard/extra-images/select?path=${encodeURIComponent('extra-images/pptnc/episode-1/story-2.jpg')}`

    it('omite a seção quando o episódio não tem imagens', () => {
      render(<EditorialReport video={createMockVideo()} cuts={[]} reels={[]} />)

      expect(screen.queryByRole('heading', { name: 'Imagens' })).not.toBeInTheDocument()
    })

    it('exibe thumbnail e imagens extras com botão de download', () => {
      render(
        <EditorialReport
          video={createMockVideo({
            storageThumbnailUrl: thumbUrl,
            extraImages: { story: storyUrl },
          })}
          cuts={[]}
          reels={[]}
        />
      )

      expect(screen.getByRole('heading', { name: 'Imagens' })).toBeInTheDocument()
      expect(screen.getByAltText('Thumbnail')).toHaveAttribute(
        'src',
        '/api/report/episode-1/image?kind=thumbnail'
      )
      expect(screen.getByAltText('Story')).toHaveAttribute(
        'src',
        '/api/report/episode-1/image?kind=story'
      )

      const download = screen.getByTestId('report-download-story')
      expect(download).toHaveAttribute('href', '/api/report/episode-1/image?kind=story&download=1')
      expect(download).toHaveAttribute('download')
    })

    it('mostra só as imagens que existem', () => {
      render(
        <EditorialReport
          video={createMockVideo({ extraImages: { feed: storyUrl } })}
          cuts={[]}
          reels={[]}
        />
      )

      expect(screen.getByTestId('report-download-feed')).toBeInTheDocument()
      expect(screen.queryByTestId('report-download-thumbnail')).not.toBeInTheDocument()
      expect(screen.queryByTestId('report-download-vitrine')).not.toBeInTheDocument()
    })
  })
})
