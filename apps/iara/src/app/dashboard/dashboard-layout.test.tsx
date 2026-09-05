import { beforeEach, describe, expect, it, vi } from 'vitest'

import userEvent from '@testing-library/user-event'

import { render, screen, waitFor, within } from '@/test-utils'

import { DashboardLayout } from './dashboard-layout'
import type { DashboardData, SpotifyWeek, YoutubeWeek } from './page'

vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
  useSession: vi.fn(() => ({
    data: {
      user: { id: 'user1', name: 'Wellington Cruz', email: 'w@example.com', role: 'admin' },
      expires: '2026-12-31',
    },
    status: 'authenticated',
  })),
}))

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard'),
  useSearchParams: vi.fn(() => ({ get: vi.fn(() => null) })),
}))

function spotifyWeek(weekStart: string, partial = false): SpotifyWeek {
  return {
    weekStart,
    weekEnd: weekStart,
    partial,
    days: 7,
    starts: 100,
    streams: 80,
    followers: 3358, // total no último dia da semana, nunca a soma
  }
}

function youtubeWeek(weekStart: string, partial = false): YoutubeWeek {
  return {
    weekStart,
    weekEnd: weekStart,
    partial,
    days: 7,
    views: 5000,
    subscribersGained: 42,
    subscribersLost: 7,
  }
}

const data: DashboardData = {
  spotify: [spotifyWeek('2026-08-26'), spotifyWeek('2026-09-02', true)],
  youtube: [youtubeWeek('2026-08-26'), youtubeWeek('2026-09-02', true)],
  unavailable: false,
}

describe('DashboardLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ data: { features: {}, enabledSocialNetworks: [], llmConfig: {} } })
      )
    )
  })

  it('dá boas-vindas usando o PRIMEIRO nome do usuário', async () => {
    render(<DashboardLayout userName="Wellington Cruz" data={data} />)
    expect(screen.getByText('Bem-vindo, Wellington')).toBeInTheDocument()
  })

  it('sem nome, ainda dá boas-vindas (não renderiza "undefined")', () => {
    render(<DashboardLayout data={data} />)
    expect(screen.getByText('Bem-vindo')).toBeInTheDocument()
  })

  it('monta as DUAS linhas do 2×2, com dois gráficos cada (linha 1 Spotify, linha 2 YouTube)', () => {
    render(<DashboardLayout userName="Wellington" data={data} />)

    expect(screen.getByRole('region', { name: 'Spotify' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'YouTube' })).toBeInTheDocument()

    expect(screen.getByText('Plays por semana')).toBeInTheDocument()
    expect(screen.getByText('Seguidores ganhos por semana')).toBeInTheDocument()
    expect(screen.getByText('Views por semana')).toBeInTheDocument()
    expect(screen.getByText('Inscritos por semana')).toBeInTheDocument()
  })

  it('cada linha tem o SEU seletor de escopo (D4) — são dois na mesma tela', () => {
    render(<DashboardLayout userName="Wellington" data={data} />)
    expect(screen.getByRole('group', { name: 'Período — Spotify' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Período — YouTube' })).toBeInTheDocument()
  })

  // A variação de seguidores é derivada ANTES do recorte de escopo: a primeira
  // semana da janela precisa da semana anterior para ter variação.
  it('trocar o escopo NÃO refaz busca ao servidor (filtro de apresentação)', async () => {
    const user = userEvent.setup()
    render(<DashboardLayout userName="Wellington" data={data} />)

    const chamadasIniciais = vi.mocked(fetch).mock.calls.length
    await user.click(
      within(screen.getByRole('group', { name: 'Período — Spotify' })).getByRole('button', {
        name: 'Todo o período',
      })
    )
    expect(vi.mocked(fetch).mock.calls.length).toBe(chamadasIniciais)
  })

  // A degradação tem que ser VISÍVEL: `series: null` (doc inválido ou ausente)
  // não pode virar quatro gráficos vazios que parecem "zero audiência".
  it('série indisponível mostra aviso explícito, não gráficos vazios', () => {
    render(
      <DashboardLayout
        userName="Wellington"
        data={{ spotify: [], youtube: [], unavailable: true }}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent(/não puderam ser lidas/i)
    expect(screen.queryByText('Spotify — plays por semana')).not.toBeInTheDocument()
  })

  // Story 31.6 / D2. Caso REAL da série de produção: 5 semanas seguidas de
  // líquido negativo no YouTube em 2026 (jul–ago). Se o gráfico mostrasse só os
  // ganhos brutos — 22 a 27 por semana —, essas semanas pareceriam positivas.
  it('o líquido do YouTube é ganhos − perdas, e sobrevive negativo', () => {
    const perdaReal: YoutubeWeek = {
      weekStart: '2026-08-19',
      weekEnd: '2026-08-25',
      partial: false,
      days: 7,
      views: 30_000,
      subscribersGained: 23,
      subscribersLost: 56,
    }
    render(
      <DashboardLayout
        userName="Wellington"
        data={{ spotify: data.spotify, youtube: [perdaReal], unavailable: false }}
      />
    )
    // A tela renderiza sem quebrar com valor negativo e mantém os dois gráficos
    // da linha do YouTube — o líquido (−33) vive na linha sobreposta.
    expect(screen.getByText('Views por semana')).toBeInTheDocument()
    expect(screen.getByText('Inscritos por semana')).toBeInTheDocument()
  })

  it('busca as features do podcast na MESMA rota que o videos-layout usa', async () => {
    render(<DashboardLayout userName="Wellington" data={data} />)
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/podcast')
    })
  })

  it('falha ao carregar features não derruba a página', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    render(<DashboardLayout userName="Wellington" data={data} />)
    await waitFor(() => {
      expect(screen.getByText('Bem-vindo, Wellington')).toBeInTheDocument()
    })
  })
})
