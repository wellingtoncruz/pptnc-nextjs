import { render, screen } from '@/test-utils'

import { DebugLogsList } from './debug-logs-list'

// Mock DebugLogEntry to simplify testing
vi.mock('./debug-log-entry', () => ({
  DebugLogEntry: ({ log }: { log: { id: string; component: string } }) => (
    <div data-testid="debug-log-entry">{log.component} - {log.id}</div>
  ),
}))

const createLog = (overrides: Partial<{
  id: string
  component: string
  model: string
  videoId: string
  videoType: 'episode' | 'cut' | 'reel'
  createdAt: string
}> = {}) => ({
  id: overrides.id ?? 'log-1',
  component: overrides.component ?? 'wizard/phase-5',
  model: overrides.model ?? 'gemini-2.5-flash',
  videoId: overrides.videoId ?? 'video-123',
  videoType: overrides.videoType ?? 'episode' as const,
  prompt: { system: 'System prompt', user: 'User prompt' },
  response: '{"titles": ["Title 1"]}',
  createdAt: overrides.createdAt ?? '2026-02-26T16:00:00.000Z',
})

describe('DebugLogsList', () => {
  it('exibe mensagem de estado vazio quando não há logs', () => {
    render(<DebugLogsList logs={[]} />)

    expect(screen.getByTestId('debug-logs-empty')).toBeInTheDocument()
    expect(screen.getByText(/Nenhum log encontrado/)).toBeInTheDocument()
    expect(screen.getByText(/Ative o Modo de Depuração LLM/)).toBeInTheDocument()
  })

  it('agrupa logs por dia com contagens separadas', () => {
    const logs = [
      createLog({ id: 'log-1', createdAt: '2026-02-26T16:00:00.000Z' }),
      createLog({ id: 'log-2', createdAt: '2026-02-26T14:00:00.000Z' }),
      createLog({ id: 'log-3', createdAt: '2026-02-25T10:00:00.000Z' }),
    ]

    render(<DebugLogsList logs={logs} />)

    // First day (Feb 26) is expanded by default and has 2 logs
    expect(screen.getByText('2 chamadas')).toBeInTheDocument()
    // Second day (Feb 25) has 1 log
    expect(screen.getByText('1 chamada')).toBeInTheDocument()
  })

  it('exibe contagem de chamadas por dia', () => {
    const logs = [
      createLog({ id: 'log-1', createdAt: '2026-02-26T16:00:00.000Z' }),
      createLog({ id: 'log-2', createdAt: '2026-02-26T14:00:00.000Z' }),
    ]

    render(<DebugLogsList logs={logs} />)

    expect(screen.getByText('2 chamadas')).toBeInTheDocument()
  })

  it('exibe "1 chamada" (singular) quando apenas um log no dia', () => {
    const logs = [
      createLog({ id: 'log-1', createdAt: '2026-02-26T16:00:00.000Z' }),
    ]

    render(<DebugLogsList logs={logs} />)

    expect(screen.getByText('1 chamada')).toBeInTheDocument()
  })
})
