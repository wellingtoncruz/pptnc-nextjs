import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { DebugLogEntry } from './debug-log-entry'

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))

const mockLog = {
  id: 'log-1',
  component: 'wizard/phase-5',
  model: 'gemini-2.5-flash',
  videoId: 'video-123',
  videoType: 'episode' as const,
  prompt: {
    system: 'You are a content analyst.',
    user: 'Analyze this video.',
  },
  response: '{"titles": ["Title 1", "Title 2"]}',
  createdAt: '2026-02-26T16:30:00.000Z',
  attachment: { sizeKB: 42.5, estimatedTokens: 10880 },
  usage: { promptTokens: 1200, completionTokens: 350, totalTokens: 1550 },
}

describe('DebugLogEntry', () => {
  it('renderiza metadados do log', () => {
    render(<DebugLogEntry log={mockLog} />)

    expect(screen.getByTestId('debug-log-entry')).toBeInTheDocument()
    expect(screen.getByText('wizard/phase-5')).toBeInTheDocument()
    expect(screen.getByText('gemini-2.5-flash')).toBeInTheDocument()
    expect(screen.getByText('episode/video-123')).toBeInTheDocument()
  })

  it('prompt está oculto por padrão', () => {
    render(<DebugLogEntry log={mockLog} />)

    expect(screen.queryByText('You are a content analyst.')).not.toBeInTheDocument()
    expect(screen.queryByText('Analyze this video.')).not.toBeInTheDocument()
  })

  it('expande prompt ao clicar', async () => {
    const user = userEvent.setup()
    render(<DebugLogEntry log={mockLog} />)

    const promptButton = screen.getByText('Prompt')
    await user.click(promptButton)

    expect(screen.getByText('You are a content analyst.')).toBeInTheDocument()
    expect(screen.getByText('Analyze this video.')).toBeInTheDocument()
  })

  it('resposta está oculta por padrão', () => {
    render(<DebugLogEntry log={mockLog} />)

    expect(screen.queryByText('{"titles": ["Title 1", "Title 2"]}')).not.toBeInTheDocument()
  })

  it('expande resposta ao clicar', async () => {
    const user = userEvent.setup()
    render(<DebugLogEntry log={mockLog} />)

    const responseButton = screen.getByText('Resposta')
    await user.click(responseButton)

    expect(screen.getByText('{"titles": ["Title 1", "Title 2"]}')).toBeInTheDocument()
  })

  it('exibe informações de attachment quando presente', () => {
    render(<DebugLogEntry log={mockLog} />)

    expect(screen.getByText(/42,5 KB/)).toBeInTheDocument()
    expect(screen.getByText(/10\.880 tokens/)).toBeInTheDocument()
  })

  it('exibe informações de usage quando presente', () => {
    render(<DebugLogEntry log={mockLog} />)

    expect(screen.getByText(/1\.200/)).toBeInTheDocument()
    expect(screen.getByText(/1\.550 total/)).toBeInTheDocument()
  })

  it('omite badges de attachment e usage quando ausentes', () => {
    const logWithoutExtras = {
      ...mockLog,
      attachment: undefined,
      usage: undefined,
    }
    render(<DebugLogEntry log={logWithoutExtras} />)

    expect(screen.queryByText(/KB/)).not.toBeInTheDocument()
    expect(screen.queryByText(/total\)/)).not.toBeInTheDocument()
  })

  it('exibe imagem quando response indica imagem gerada e componente é newsletter/image-generate', async () => {
    const user = userEvent.setup()
    const imageLog = {
      ...mockLog,
      component: 'newsletter/image-generate',
      response: '[Image: 245760 bytes, image/png]',
    }

    render(<DebugLogEntry log={imageLog} />)

    await user.click(screen.getByText('Resposta'))

    expect(screen.getByTestId('debug-log-image')).toBeInTheDocument()
    expect(screen.getByTestId('debug-log-image')).toHaveAttribute('src', expect.stringContaining('/api/videos/video-123/newsletter/image'))
    expect(screen.getByText('[Image: 245760 bytes, image/png]')).toBeInTheDocument()
  })

  it('NÃO exibe imagem para componente que não é newsletter/image-generate', async () => {
    const user = userEvent.setup()

    render(<DebugLogEntry log={mockLog} />)

    await user.click(screen.getByText('Resposta'))

    expect(screen.queryByTestId('debug-log-image')).not.toBeInTheDocument()
  })
})
