import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test-utils'

const { mockAuth, mockSignIn, mockRedirect } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockSignIn: vi.fn(),
  mockRedirect: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: mockAuth,
  signIn: mockSignIn,
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import HomePage from './page'

describe('HomePage (public landing)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a public landing with a visible Privacy Policy link when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null)

    render(await HomePage())

    expect(screen.getByRole('heading', { level: 1, name: 'IAra' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Entrar com Google/ })).toBeInTheDocument()

    const privacyLink = screen.getByRole('link', { name: 'Política de Privacidade' })
    expect(privacyLink).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Termos de Serviço' })).toHaveAttribute('href', '/terms')

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  // Epic 31 (D5): a aba inicial passou de /videos para /dashboard em
  // 2026-09-04. A raiz continua PÚBLICA (exigência da verificação OAuth do
  // Google, v2.9.4) — só o ramo do usuário autenticado mudou de destino.
  it('redirects authenticated users to /dashboard (aba inicial, Epic 31)', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } })

    await HomePage()

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard')
  })

  it('does not redirect when the session carries an error', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' }, error: 'RefreshTokenError' })

    render(await HomePage())

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Entrar com Google/ })).toBeInTheDocument()
  })
})
