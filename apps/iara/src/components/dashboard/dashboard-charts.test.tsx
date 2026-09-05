import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { render, screen } from '@/test-utils'

import { ScopeSelector, SCOPE_LABELS } from './scope-selector'
import { WeeklyChart, type ChartWeek } from './weekly-chart'

function week(weekStart: string, weekEnd: string, partial = false): ChartWeek {
  return { weekStart, weekEnd, partial, days: 7, starts: 100, streams: 80 }
}

describe('ScopeSelector', () => {
  it('oferece os três escopos da D4, com "últimas 12 semanas" no lugar de "último mês"', () => {
    render(<ScopeSelector value="last-12-weeks" onChange={vi.fn()} label="Spotify" />)

    expect(screen.getByRole('button', { name: SCOPE_LABELS['last-12-weeks'] })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: SCOPE_LABELS['year-to-date'] })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: SCOPE_LABELS['all-time'] })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /último mês/i })).not.toBeInTheDocument()
  })

  it('marca o escopo ativo com aria-pressed (operável e legível por leitor de tela)', () => {
    render(<ScopeSelector value="year-to-date" onChange={vi.fn()} label="Spotify" />)

    expect(screen.getByRole('button', { name: SCOPE_LABELS['year-to-date'] })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: SCOPE_LABELS['all-time'] })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('o grupo é rotulado pela linha que ele controla (há dois na mesma tela)', () => {
    render(<ScopeSelector value="all-time" onChange={vi.fn()} label="YouTube" />)
    expect(screen.getByRole('group', { name: 'Período — YouTube' })).toBeInTheDocument()
  })

  it('avisa a troca de escopo', async () => {
    const onChange = vi.fn()
    render(<ScopeSelector value="last-12-weeks" onChange={onChange} label="Spotify" />)

    await userEvent.click(screen.getByRole('button', { name: SCOPE_LABELS['all-time'] }))
    expect(onChange).toHaveBeenCalledWith('all-time')
  })
})

describe('WeeklyChart', () => {
  const series = [{ key: 'starts', label: 'Iniciados', type: 'area' as const, tone: 1 as const }]

  it('sem semanas, mostra estado vazio explícito em vez de eixo em branco', () => {
    render(<WeeklyChart title="Plays por semana" weeks={[]} series={series} />)
    expect(screen.getByText('Sem dados no período selecionado')).toBeInTheDocument()
  })

  it('o texto do estado vazio é customizável por gráfico', () => {
    render(
      <WeeklyChart
        title="Seguidores"
        weeks={[]}
        series={series}
        emptyLabel="Sem variação de seguidores no período"
      />
    )
    expect(screen.getByText('Sem variação de seguidores no período')).toBeInTheDocument()
  })

  // D3: sem esse aviso a última coluna leria como queda — numa quinta-feira ela
  // tem 1 dia contra 7 das outras.
  it('avisa quando a última semana está EM ANDAMENTO, com o intervalo', () => {
    render(
      <WeeklyChart
        title="Plays por semana"
        weeks={[week('2026-08-26', '2026-09-01'), week('2026-09-02', '2026-09-08', true)]}
        series={series}
      />
    )
    expect(screen.getByText(/em andamento/i)).toBeInTheDocument()
    expect(screen.getByText(/02\/09 a 08\/09/)).toBeInTheDocument()
  })

  it('aceita série com valor NEGATIVO sem quebrar (líquido de inscritos)', () => {
    const negativa: ChartWeek = {
      weekStart: '2026-08-19',
      weekEnd: '2026-08-25',
      partial: false,
      days: 7,
      net: -33,
    }
    render(
      <WeeklyChart
        title="Inscritos por semana"
        weeks={[negativa]}
        series={[{ key: 'net', label: 'Líquido', type: 'line', tone: 3 }]}
      />
    )
    expect(screen.getByText('Inscritos por semana')).toBeInTheDocument()
    expect(screen.queryByText('Sem dados no período selecionado')).not.toBeInTheDocument()
  })

  it('sem semana parcial, nenhum aviso aparece', () => {
    render(
      <WeeklyChart
        title="Plays por semana"
        weeks={[week('2026-08-26', '2026-09-01')]}
        series={series}
      />
    )
    expect(screen.queryByText(/em andamento/i)).not.toBeInTheDocument()
  })
})
