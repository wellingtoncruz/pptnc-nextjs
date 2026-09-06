'use client'

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { WeekMeta } from '@/lib/analytics/weekly'

/** Uma semana pronta para o gráfico: metadados + métricas (podem faltar). */
export type ChartWeek = WeekMeta & Record<string, number | string | boolean | undefined>

export interface ChartSeries {
  /** Campo da semana a desenhar. */
  key: string
  label: string
  /** `area` para volume, `line` para sobrepor (o líquido da D2), `bar` para
   * valores que podem ser NEGATIVOS — área atravessando o eixo é ilegível. */
  type: 'area' | 'line' | 'bar'
  /** Índice do token `--chart-N` do tema (1..5). Cores vêm do design system. */
  tone: 1 | 2 | 3 | 4 | 5
}

interface WeeklyChartProps {
  title: string
  weeks: readonly ChartWeek[]
  series: readonly ChartSeries[]
  /** Texto do estado vazio — some do jeito certo em vez de eixo em branco. */
  emptyLabel?: string
}

const nf = new Intl.NumberFormat('pt-BR')

/**
 * Intervalo do eixo X a sombrear para marcar a semana em andamento (D3).
 *
 * **O intervalo correto depende da escala do eixo**, e a escala do eixo de
 * categorias do Recharts muda conforme o gráfico tenha barra ou não. Medido no
 * browser em 2026-09-06 (sonda isolada com Recharts 3.8), porque duas tentativas
 * por raciocínio erraram:
 *
 * | gráfico          | escala | x1=x2=parcial      | x1=anterior, x2=parcial |
 * |------------------|--------|--------------------|-------------------------|
 * | área / linha     | point  | invisível (larg. 0)| ✅ cobre o trecho final |
 * | com barra        | band   | ✅ cobre a banda   | ❌ cobre DUAS bandas    |
 *
 * Em escala `point` os valores são pontos, e um intervalo degenerado tem
 * largura zero. Em escala `band` cada categoria ocupa uma faixa e o intervalo é
 * **inclusivo nas duas pontas** — daí pegar duas semanas.
 *
 * Histórico: o código original usava `x1 === x2` em todos, então o sombreado
 * NUNCA renderizou em área/linha; o gráfico de barras só parecia marcado por
 * causa de um segundo mecanismo (opacidade por `Cell`). Bug relatado pelo
 * Wellington em 2026-09-06.
 *
 * Devolve `null` quando não há semana parcial, ou quando ela é a única num
 * gráfico sem barra (não há de onde partir) — a legenda em texto abaixo do
 * gráfico segue explicando nesse caso.
 */
export function partialShadeRange(
  weeks: readonly ChartWeek[],
  hasBandScale: boolean
): { from: string; to: string } | null {
  const index = weeks.findIndex((w) => w.partial)
  if (index < 0) return null

  const partialStart = weeks[index].weekStart
  // Escala band: a própria categoria já é uma faixa com largura.
  if (hasBandScale) return { from: partialStart, to: partialStart }
  // Escala point: precisa de dois pontos distintos para ter largura.
  if (index === 0) return null
  return { from: weeks[index - 1].weekStart, to: partialStart }
}

/** `2026-09-02` → `02/09`. Rótulo do eixo X: início da semana (quarta). */
function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

function toneVar(tone: number): string {
  return `var(--chart-${tone})`
}

/**
 * Gráfico semanal reutilizável do Dashboard (Epic 31).
 *
 * Genérico de propósito: as quatro células do 2×2 são a mesma peça com
 * configurações diferentes — área com duas séries (plays do Spotify, D1),
 * barra de variação líquida (seguidores, quando a fonte só dá totais), e área
 * + linha sobreposta (inscritos do YouTube, D2). Usa `ComposedChart` porque é o
 * único que aceita os três tipos no mesmo eixo.
 *
 * A semana PARCIAL (D3) é marcada com uma faixa sombreada e legenda própria —
 * funciona igual para área, linha e barra, ao contrário de tracejar o traço,
 * que só serviria para linha. Sem isso, a última coluna leria como queda: numa
 * quinta-feira ela tem 1 dia contra 7 das outras.
 */
export function WeeklyChart({ title, weeks, series, emptyLabel }: WeeklyChartProps) {
  const partial = weeks.find((w) => w.partial)
  // A presença de uma barra é o que faz o Recharts usar escala `band` no eixo
  // de categorias — e é o que decide qual intervalo sombrear.
  const hasBandScale = series.some((s) => s.type === 'bar')
  const shade = partialShadeRange(weeks, hasBandScale)

  // Linha do zero quando alguma série cruza para baixo — sem ela, "−23" e "+23"
  // ficam visualmente parecidos e o leitor não sabe de que lado do eixo está.
  // Caso real: o YouTube teve 5 semanas de líquido negativo seguidas em 2026.
  const hasNegative = weeks.some((w) =>
    series.some((s) => {
      const v = w[s.key]
      return typeof v === 'number' && v < 0
    })
  )

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>

      {weeks.length === 0 ? (
        <div className="mt-4 flex h-56 items-center justify-center rounded-md bg-muted/30 text-xs text-muted-foreground">
          {emptyLabel ?? 'Sem dados no período selecionado'}
        </div>
      ) : (
        <>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={weeks as ChartWeek[]} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="weekStart"
                  tickFormatter={shortDate}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v: number) => nf.format(v)}
                />
                <Tooltip content={<WeekTooltip weeks={weeks} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />

                {hasNegative ? (
                  <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
                ) : null}

                {shade ? (
                  <ReferenceArea
                    x1={shade.from}
                    x2={shade.to}
                    fill="var(--muted-foreground)"
                    fillOpacity={0.12}
                    ifOverflow="extendDomain"
                  />
                ) : null}

                {series.map((s) =>
                  s.type === 'area' ? (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={toneVar(s.tone)}
                      fill={toneVar(s.tone)}
                      fillOpacity={0.2}
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                  ) : s.type === 'line' ? (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={toneVar(s.tone)}
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                  ) : (
                    <Bar key={s.key} dataKey={s.key} name={s.label} fill={toneVar(s.tone)}>
                      {weeks.map((w) => (
                        // Semana parcial mais apagada também na barra.
                        <Cell key={w.weekStart} fillOpacity={w.partial ? 0.45 : 1} />
                      ))}
                    </Bar>
                  )
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {partial ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              A última semana ({shortDate(partial.weekStart)} a {shortDate(partial.weekEnd)}) está{' '}
              <strong className="font-medium">em andamento</strong> — ainda não fechou.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}


interface TooltipEntry {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
}

/**
 * Tooltip próprio em vez dos `formatter`/`labelFormatter` do Recharts.
 *
 * Escrito à mão por dois motivos: os formatters do Recharts 3 têm assinatura
 * difícil de tipar sem cast, e aqui o texto precisa dizer o INTERVALO da semana
 * (quarta a terça) e avisar quando ela ainda está em andamento — coisas que o
 * rótulo padrão, que mostraria só a data de início, não comunica.
 */
function WeekTooltip({
  active,
  payload,
  label,
  weeks,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  weeks: readonly ChartWeek[]
}) {
  if (!active || !payload?.length) return null

  const week = weeks.find((w) => w.weekStart === label)
  const range = week ? `${shortDate(week.weekStart)} a ${shortDate(week.weekEnd)}` : String(label)

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{range}</p>
      {week?.partial ? (
        <p className="text-[11px] text-muted-foreground">semana em andamento</p>
      ) : null}
      <ul className="mt-1.5 space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block size-2 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium text-foreground">
              {typeof entry.value === 'number' ? nf.format(entry.value) : String(entry.value ?? '—')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
