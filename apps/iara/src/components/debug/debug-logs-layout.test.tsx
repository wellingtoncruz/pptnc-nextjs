import { beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/test-utils'

import { DebugLogsLayout } from './debug-logs-layout'

// Mock child component
vi.mock('./debug-logs-list', () => ({
  DebugLogsList: ({ logs }: { logs: unknown[] }) => (
    <div data-testid="debug-logs-list">Logs: {logs.length}</div>
  ),
}))

describe('DebugLogsLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exibe loading spinner enquanto carrega', () => {
    // Never resolve fetch to keep loading state
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch

    render(<DebugLogsLayout />)

    expect(screen.getByTestId('debug-logs-layout')).toBeInTheDocument()
    // Spinner is the animated div
    expect(screen.getByText('Depuração LLM')).toBeInTheDocument()
  })

  it('renderiza DebugLogsList após carregar logs', async () => {
    const mockLogs = [
      { id: 'log-1', component: 'wizard/phase-5', model: 'gemini-2.5-flash', videoId: 'v1', videoType: 'episode' as const, prompt: { system: 's', user: 'u' }, response: 'r', createdAt: '2026-02-26T16:00:00.000Z' },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { logs: mockLogs } }),
    }) as unknown as typeof fetch

    render(<DebugLogsLayout />)

    await waitFor(() => {
      expect(screen.getByTestId('debug-logs-list')).toBeInTheDocument()
    })

    expect(screen.getByText('Logs: 1')).toBeInTheDocument()
    expect(screen.getByText('1 de 1 log')).toBeInTheDocument()
  })

  it('exibe mensagem de erro quando fetch falha', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch

    render(<DebugLogsLayout />)

    await waitFor(() => {
      expect(screen.getByText('Falha ao carregar logs')).toBeInTheDocument()
    })
  })

  it('exibe mensagem específica para erro 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }) as unknown as typeof fetch

    render(<DebugLogsLayout />)

    await waitFor(() => {
      expect(screen.getByText('Sessão expirada. Faça login novamente.')).toBeInTheDocument()
    })
  })

  it('exibe mensagem específica para erro 403', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    }) as unknown as typeof fetch

    render(<DebugLogsLayout />)

    await waitFor(() => {
      expect(screen.getByText('Acesso negado. Apenas administradores podem visualizar logs.')).toBeInTheDocument()
    })
  })

  it('exibe contagem de logs no header', async () => {
    const mockLogs = [
      { id: 'log-1', component: 'wizard/phase-5', model: 'gemini-2.5-flash', videoId: 'v1', videoType: 'episode' as const, prompt: { system: 's', user: 'u' }, response: 'r', createdAt: '2026-02-26T16:00:00.000Z' },
      { id: 'log-2', component: 'adwords/generate', model: 'gemini-2.5-flash', videoId: 'v2', videoType: 'episode' as const, prompt: { system: 's', user: 'u' }, response: 'r', createdAt: '2026-02-26T15:00:00.000Z' },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { logs: mockLogs } }),
    }) as unknown as typeof fetch

    render(<DebugLogsLayout />)

    await waitFor(() => {
      expect(screen.getByText('2 de 2 logs')).toBeInTheDocument()
    })
  })

  it('exibe total de custo somando estimatedCostUsd', async () => {
    const mockLogs = [
      { id: 'log-1', component: 'a', model: 'gemini-2.5-flash', provider: 'gemini', estimatedCostUsd: 0.05, videoId: 'v1', videoType: 'episode' as const, prompt: { system: 's', user: 'u' }, response: 'r', createdAt: '2026-05-15T10:00:00.000Z' },
      { id: 'log-2', component: 'b', model: 'claude-sonnet-4-6', provider: 'claude', estimatedCostUsd: 0.15, videoId: 'v2', videoType: 'episode' as const, prompt: { system: 's', user: 'u' }, response: 'r', createdAt: '2026-05-15T11:00:00.000Z' },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { logs: mockLogs } }),
    }) as unknown as typeof fetch

    render(<DebugLogsLayout />)

    await waitFor(() => {
      expect(screen.getByText('Total no período:')).toBeInTheDocument()
    })
    // 0.05 + 0.15 = 0.20 → $0.20
    expect(screen.getByText(/\$0\.20/)).toBeInTheDocument()
  })

  it('filtra logs por provider', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const user = userEvent.setup()

    const mockLogs = [
      { id: 'log-1', component: 'a', model: 'gemini-2.5-flash', provider: 'gemini', estimatedCostUsd: 0.01, videoId: 'v1', videoType: 'episode' as const, prompt: { system: 's', user: 'u' }, response: 'r', createdAt: '2026-05-15T10:00:00.000Z' },
      { id: 'log-2', component: 'b', model: 'claude-sonnet-4-6', provider: 'claude', estimatedCostUsd: 0.15, videoId: 'v2', videoType: 'episode' as const, prompt: { system: 's', user: 'u' }, response: 'r', createdAt: '2026-05-15T11:00:00.000Z' },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { logs: mockLogs } }),
    }) as unknown as typeof fetch

    render(<DebugLogsLayout />)
    await waitFor(() => expect(screen.getByTestId('filter-provider')).toBeInTheDocument())

    await user.selectOptions(screen.getByTestId('filter-provider'), 'claude')

    expect(screen.getByText('1 de 2 logs')).toBeInTheDocument()
    expect(screen.getByText('Logs: 1')).toBeInTheDocument()
  })
})
