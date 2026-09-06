import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { render, screen } from '@/test-utils'

import { ScopeSelector, SCOPE_LABELS } from './scope-selector'
import { WeeklyChart, partialShadeRange, type ChartWeek } from './weekly-chart'

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

// ── marcação da semana em andamento (bug achado pelo Wellington, 2026-09-06) ──
//
// O `ReferenceArea` original usava `x1 === x2` — largura ZERO, não renderiza em
// gráfico nenhum. Só o gráfico de barras PARECIA marcado, e apenas porque
// barras têm um segundo mecanismo (opacidade por `Cell`). A geometria virou
// função pura justamente para deixar de depender de inspeção visual.
describe('partialShadeRange', () => {
  const w = (weekStart: string, partial = false): ChartWeek => ({
    weekStart,
    weekEnd: weekStart,
    partial,
    days: 7,
  })
  const semanas = [w('2026-08-19'), w('2026-08-26'), w('2026-09-02', true)]

  // Tabela verdade MEDIDA no browser em 2026-09-06 (sonda isolada com Recharts
  // 3.8), depois de duas tentativas por raciocínio errarem. O intervalo certo
  // depende da escala do eixo, que muda conforme o gráfico tenha barra.

  it('escala POINT (área/linha): dois pontos distintos — x1===x2 teria largura zero', () => {
    const range = partialShadeRange(semanas, false)
    expect(range).toEqual({ from: '2026-08-26', to: '2026-09-02' })
    expect(range!.from).not.toBe(range!.to)
  })

  it('escala BAND (barra): a própria categoria — intervalo maior pegaria DUAS semanas', () => {
    const range = partialShadeRange(semanas, true)
    expect(range).toEqual({ from: '2026-09-02', to: '2026-09-02' })
  })

  it('sem semana parcial, não sombreia nada — nas duas escalas', () => {
    const completas = [w('2026-08-19'), w('2026-08-26')]
    expect(partialShadeRange(completas, false)).toBeNull()
    expect(partialShadeRange(completas, true)).toBeNull()
  })

  it('semana parcial ÚNICA: sem sombra em point (não há de onde partir), com sombra em band', () => {
    const so = [w('2026-09-02', true)]
    expect(partialShadeRange(so, false)).toBeNull()
    expect(partialShadeRange(so, true)).toEqual({ from: '2026-09-02', to: '2026-09-02' })
  })

  it('série vazia não quebra', () => {
    expect(partialShadeRange([], false)).toBeNull()
    expect(partialShadeRange([], true)).toBeNull()
  })
})
