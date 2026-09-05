import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('exibe Redes Sociais quando features.socialMedia=true e enabledSocialNetworks tem itens', async () => {
    render(<Sidebar features={{ socialMedia: true }} enabledSocialNetworks={['instagram', 'twitter']} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.getByText('Redes Sociais')).toBeInTheDocument()
  })

  it('oculta Redes Sociais quando features.socialMedia=false', async () => {
    render(<Sidebar features={{ socialMedia: false }} enabledSocialNetworks={['instagram']} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.queryByText('Redes Sociais')).not.toBeInTheDocument()
  })

  it('oculta Redes Sociais quando enabledSocialNetworks está vazio', async () => {
    render(<Sidebar features={{ socialMedia: true }} enabledSocialNetworks={[]} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.queryByText('Redes Sociais')).not.toBeInTheDocument()
  })

  it('oculta Redes Sociais quando features é undefined (backward-compat)', async () => {
    render(<Sidebar enabledSocialNetworks={['instagram']} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.queryByText('Redes Sociais')).not.toBeInTheDocument()
  })

  it('oculta Redes Sociais quando enabledSocialNetworks é undefined (omitido)', async () => {
    render(<Sidebar features={{ socialMedia: true }} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.queryByText('Redes Sociais')).not.toBeInTheDocument()
  })

  it('destaca Redes Sociais quando view=social está ativo', async () => {
    const { useSearchParams } = await import('next/navigation')
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key: string) => (key === 'view' ? 'social' : null)),
    } as any)

    render(<Sidebar features={{ socialMedia: true }} enabledSocialNetworks={['instagram']} />)

    await waitFor(() => {
      expect(screen.getByText('Redes Sociais')).toBeInTheDocument()
    })

    const socialLink = screen.getByText('Redes Sociais').closest('a')
    expect(socialLink).toHaveClass('bg-accent')

    // Vídeos should NOT be active when social is active
    const videosLink = screen.getByText('Vídeos').closest('a')
    expect(videosLink).not.toHaveClass('bg-accent')
  })

  it('link Redes Sociais aponta para /videos?view=social', async () => {
    render(<Sidebar features={{ socialMedia: true }} enabledSocialNetworks={['instagram']} />)

    await waitFor(() => {
      expect(screen.getByText('Redes Sociais')).toBeInTheDocument()
    })

    const socialLink = screen.getByText('Redes Sociais').closest('a')
    expect(socialLink).toHaveAttribute('href', '/videos?view=social')
  })

  it('exibe Tráfego Pago quando features.adwords=true', async () => {
    render(<Sidebar features={{ adwords: true }} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.getByText('Tráfego Pago')).toBeInTheDocument()
  })

  it('oculta Tráfego Pago quando features.adwords=false', async () => {
    render(<Sidebar features={{ adwords: false }} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.queryByText('Tráfego Pago')).not.toBeInTheDocument()
  })

  it('oculta Tráfego Pago quando features é undefined (backward-compat)', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.queryByText('Tráfego Pago')).not.toBeInTheDocument()
  })

  it('destaca Tráfego Pago quando view=adwords está ativo', async () => {
    const { useSearchParams } = await import('next/navigation')
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key: string) => (key === 'view' ? 'adwords' : null)),
    } as any)

    render(<Sidebar features={{ adwords: true }} />)

    await waitFor(() => {
      expect(screen.getByText('Tráfego Pago')).toBeInTheDocument()
    })

    const adwordsLink = screen.getByText('Tráfego Pago').closest('a')
    expect(adwordsLink).toHaveClass('bg-accent')

    // Vídeos should NOT be active when adwords is active
    const videosLink = screen.getByText('Vídeos').closest('a')
    expect(videosLink).not.toHaveClass('bg-accent')
  })

  it('link Tráfego Pago aponta para /videos?view=adwords', async () => {
    render(<Sidebar features={{ adwords: true }} />)

    await waitFor(() => {
      expect(screen.getByText('Tráfego Pago')).toBeInTheDocument()
    })

    const adwordsLink = screen.getByText('Tráfego Pago').closest('a')
    expect(adwordsLink).toHaveAttribute('href', '/videos?view=adwords')
  })

  it('exibe Newsletter quando features.newsletter=true', async () => {
    render(<Sidebar features={{ newsletter: true }} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.getByText('Newsletter')).toBeInTheDocument()
  })

  it('oculta Newsletter quando features.newsletter=false', async () => {
    render(<Sidebar features={{ newsletter: false }} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.queryByText('Newsletter')).not.toBeInTheDocument()
  })

  it('oculta Newsletter quando features é undefined (backward-compat)', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.queryByText('Newsletter')).not.toBeInTheDocument()
  })

  it('destaca Newsletter quando view=newsletter está ativo', async () => {
    const { useSearchParams } = await import('next/navigation')
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key: string) => (key === 'view' ? 'newsletter' : null)),
    } as any)

    render(<Sidebar features={{ newsletter: true }} />)

    await waitFor(() => {
      expect(screen.getByText('Newsletter')).toBeInTheDocument()
    })

    const newsletterLink = screen.getByText('Newsletter').closest('a')
    expect(newsletterLink).toHaveClass('bg-accent')

    // Vídeos should NOT be active when newsletter is active
    const videosLink = screen.getByText('Vídeos').closest('a')
    expect(videosLink).not.toHaveClass('bg-accent')
  })

  it('link Newsletter aponta para /videos?view=newsletter', async () => {
    render(<Sidebar features={{ newsletter: true }} />)

    await waitFor(() => {
      expect(screen.getByText('Newsletter')).toBeInTheDocument()
    })

    const newsletterLink = screen.getByText('Newsletter').closest('a')
    expect(newsletterLink).toHaveAttribute('href', '/videos?view=newsletter')
  })

  it('exibe Depuração quando features.llmDebugMode=true', async () => {
    render(<Sidebar features={{ llmDebugMode: true }} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.getByText('Depuração')).toBeInTheDocument()
  })

  it('oculta Depuração quando features.llmDebugMode=false', async () => {
    render(<Sidebar features={{ llmDebugMode: false }} />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.queryByText('Depuração')).not.toBeInTheDocument()
  })

  it('oculta Depuração quando features é undefined (backward-compat)', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByText('IAra')).toBeInTheDocument()
    })

    expect(screen.queryByText('Depuração')).not.toBeInTheDocument()
  })

  it('link Depuração aponta para /videos?view=debug', async () => {
    render(<Sidebar features={{ llmDebugMode: true }} />)

    await waitFor(() => {
      expect(screen.getByText('Depuração')).toBeInTheDocument()
    })

    const debugLink = screen.getByText('Depuração').closest('a')
    expect(debugLink).toHaveAttribute('href', '/videos?view=debug')
  })

  it('destaca Depuração quando view=debug está ativo', async () => {
    const { useSearchParams } = await import('next/navigation')
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key: string) => (key === 'view' ? 'debug' : null)),
    } as any)

    render(<Sidebar features={{ llmDebugMode: true }} />)

    await waitFor(() => {
      expect(screen.getByText('Depuração')).toBeInTheDocument()
    })

    const debugLink = screen.getByText('Depuração').closest('a')
    expect(debugLink).toHaveClass('bg-accent')

    // Vídeos should NOT be active when debug is active
    const videosLink = screen.getByText('Vídeos').closest('a')
    expect(videosLink).not.toHaveClass('bg-accent')
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

  it('oculta Depuração para non-admin mesmo com llmDebugMode=true', async () => {
    const { useSession } = await import('next-auth/react')
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: { id: 'user1', name: 'Test User', email: 'test@example.com', role: 'viewer' },
        expires: '2026-12-31',
      },
      status: 'authenticated',
    } as any)

    render(<Sidebar features={{ llmDebugMode: true }} />)

    await waitFor(() => {
      expect(screen.getByText('Vídeos')).toBeInTheDocument()
    })

    expect(screen.queryByText('Depuração')).not.toBeInTheDocument()
  })

  // Epic 31 (D5): o Dashboard é a aba INICIAL e mora em rota própria
  // (`/dashboard`), não em `?view=`. A aba ativa dele NÃO depende de
  // searchParams, ao contrário das dez abas de `/videos`.
  describe('aba Dashboard (Epic 31)', () => {
    it('aparece como PRIMEIRO item da navegação, apontando para /dashboard', async () => {
      render(<Sidebar />)

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })

      const dashboard = screen.getByText('Dashboard').closest('a')
      expect(dashboard).toHaveAttribute('href', '/dashboard')

      // Primeiro da lista: vem antes de Vídeos no DOM.
      const videos = screen.getByText('Vídeos').closest('a')
      expect(dashboard!.compareDocumentPosition(videos!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    })

    it('não é escondido por feature flag (não é opcional como as demais abas)', async () => {
      render(
        <Sidebar
          features={{
            editorial: false,
            news: false,
            socialMedia: false,
            adwords: false,
            newsletter: false,
            socialPublish: false,
            llmDebugMode: false,
          }}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })
      expect(screen.queryByText('Editorial')).not.toBeInTheDocument()
    })

    it('em /dashboard o item ativo é o Dashboard, e Vídeos NÃO fica ativo', async () => {
      const { usePathname } = await import('next/navigation')
      vi.mocked(usePathname).mockReturnValue('/dashboard')

      render(<Sidebar />)

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument()
      })

      const dashboard = screen.getByText('Dashboard').closest('a')
      const videos = screen.getByText('Vídeos').closest('a')
      expect(dashboard?.className).toContain('bg-')
      expect(videos?.className).not.toEqual(dashboard?.className)
    })
  })
})
