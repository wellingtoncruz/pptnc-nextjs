import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { Sidebar } from './sidebar'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
  useSession: vi.fn(() => ({
    data: {
      user: { id: 'user1', name: 'Test User', email: 'test@example.com', role: 'admin' },
      expires: '2026-12-31',
    },
    status: 'authenticated',
  })),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/videos'),
  useSearchParams: vi.fn(() => ({
    get: vi.fn((key: string) => null),
  })),
}))

describe('Sidebar', () => {
  // Create fresh localStorage mock for each test
  let localStorageStore: Record<string, string> = {}
  const localStorageMock = {
    getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      localStorageStore[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete localStorageStore[key]
    }),
    clear: vi.fn(() => {
      localStorageStore = {}
    }),
  }

  beforeEach(() => {
    localStorageStore = {}
    vi.clearAllMocks()
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })
  })

  it('renderiza a sidebar com logo e navegação', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })
    expect(screen.getByText('Vídeos')).toBeInTheDocument()
    expect(screen.getByText('Editorial')).toBeInTheDocument()
    expect(screen.getByText('Configurações')).toBeInTheDocument()
  })

  it('mostra o nome do usuário quando fornecido', async () => {
    render(<Sidebar userName="John Doe" />)

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument()
    })
  })

  it('colapsa quando botão toggle é clicado', async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    const toggleBtn = screen.getByRole('button', { name: /colapsar/i })
    await user.click(toggleBtn)

    expect(screen.getByTestId('sidebar')).toHaveClass('collapsed')
  })

  it('expande quando botão toggle é clicado novamente', async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    const toggleBtn = screen.getByRole('button', { name: /colapsar/i })
    await user.click(toggleBtn)

    expect(screen.getByTestId('sidebar')).toHaveClass('collapsed')

    const expandBtn = screen.getByRole('button', { name: /expandir/i })
    await user.click(expandBtn)

    expect(screen.getByTestId('sidebar')).not.toHaveClass('collapsed')
  })

  it('persiste estado collapsed no localStorage', async () => {
    const user = userEvent.setup()
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    const toggleBtn = screen.getByRole('button', { name: /colapsar/i })
    await user.click(toggleBtn)

    expect(localStorageMock.setItem).toHaveBeenCalledWith('sidebar-collapsed', 'true')
  })

  it('carrega estado collapsed do localStorage', async () => {
    // Set collapsed state before render
    localStorageStore['sidebar-collapsed'] = 'true'

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('sidebar')).toHaveClass('collapsed')
    })
  })

  it('destaca link ativo baseado no pathname', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    // Find the Videos navigation link (not the logo link)
    const videosLink = screen.getByText('Vídeos').closest('a')
    expect(videosLink).toHaveClass('bg-accent')
  })

  it('mostra botão de logout quando expandido', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    // In expanded state, logout text should be visible
    expect(screen.getByText('Sair')).toBeInTheDocument()
  })

  it('mostra a versão da aplicação no footer', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    // Version should be displayed (defaults to 'dev' in test environment)
    expect(screen.getByText('dev')).toBeInTheDocument()
  })

  it('exibe item Editorial com link correto', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('Editorial')).toBeInTheDocument()
    })

    const editorialLink = screen.getByText('Editorial').closest('a')
    expect(editorialLink).toHaveAttribute('href', '/videos?view=editorial')
  })

  it('destaca Editorial quando view=editorial está ativo', async () => {
    const { useSearchParams } = await import('next/navigation')
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key: string) => (key === 'view' ? 'editorial' : null)),
    } as any)

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('Editorial')).toBeInTheDocument()
    })

    const editorialLink = screen.getByText('Editorial').closest('a')
    expect(editorialLink).toHaveClass('bg-accent')

    // Vídeos should NOT be active when editorial is active
    const videosLink = screen.getByText('Vídeos').closest('a')
    expect(videosLink).not.toHaveClass('bg-accent')
  })

  it('hides Editorial when features.editorial is false', async () => {
    render(<Sidebar features={{ editorial: false, news: true }} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.queryByText('Editorial')).not.toBeInTheDocument()
    expect(screen.getByText('Notícias')).toBeInTheDocument()
  })

  it('hides Notícias when features.news is false', async () => {
    render(<Sidebar features={{ editorial: true, news: false }} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.getByText('Editorial')).toBeInTheDocument()
    expect(screen.queryByText('Notícias')).not.toBeInTheDocument()
  })

  it('shows both sections when features is undefined (backward-compatible)', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.getByText('Editorial')).toBeInTheDocument()
    expect(screen.getByText('Notícias')).toBeInTheDocument()
  })

  it('exibe Editorial para usuários não-admin', async () => {
    // Mock non-admin user
    const { useSession } = await import('next-auth/react')
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: { id: 'user1', name: 'Test User', email: 'test@example.com', role: 'viewer' },
        expires: '2026-12-31',
      },
      status: 'authenticated',
    } as any)

    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('Editorial')).toBeInTheDocument()
    })

    // Editorial is visible for non-admin
    expect(screen.getByText('Editorial')).toBeInTheDocument()
    // Admin-only items should be hidden
    expect(screen.queryByText('Configurações')).not.toBeInTheDocument()
  })
})
