/**
 * Agregação semanal das séries diárias do dashboard (Epic 31, story 31.3).
 *
 * Módulo **puro**: sem Firestore, sem React, sem rede. Recebe pontos diários,
 * devolve semanas. A agregação acontece na LEITURA, no consumidor — nenhuma
 * semana é persistida, o contrato do dado continua diário cru (AI 37).
 *
 * Regras do épico:
 * - **D6** — a semana do produtor vai de **quarta a terça**. `2021-09-01`,
 *   primeiro dia das duas séries, é uma quarta-feira: a borda esquerda fecha
 *   exata, sem dias órfãos.
 * - **D3** — a semana que contém "hoje" vem marcada `partial: true`.
 * - **D4** — três escopos: últimas 12 semanas, desde 1º de janeiro do ano
 *   corrente, todo o período. O filtro opera sobre semanas já formadas.
 *
 * **Datas são strings ISO `'YYYY-MM-DD'` e todo o cálculo é em UTC.** Construir
 * `new Date('2021-09-01')` e ler com getters LOCAIS (`getDay()`, `getDate()`)
 * muda o dia-da-semana conforme o fuso e desloca a semana inteira — em
 * America/Sao_Paulo (UTC-3) `new Date('2021-09-01').getDay()` devolve 2
 * (terça), não 3 (quarta). Aqui só entram `Date.UTC` e getters `getUTC*`.
 */

/** Data no formato ISO `'YYYY-MM-DD'`. */
export type IsoDate = string

/** Todo ponto de série diária tem, no mínimo, a data. */
export interface DailyPoint {
  date: IsoDate
}

/** Chaves de `T` cujo valor é numérico (ignora `date` e campos opcionais não-numéricos). */
export type NumericKeys<T> = Extract<
  {
    [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never
  }[keyof T],
  string
>

/** Campos de controle da semana — nomes reservados, não podem ser somados. */
export interface WeekMeta {
  /** Quarta-feira que abre a semana, ISO UTC. */
  weekStart: IsoDate
  /** Terça-feira que fecha a semana, ISO UTC (sempre `weekStart` + 6 dias). */
  weekEnd: IsoDate
  /** `true` só na semana que contém "hoje" (D3). */
  partial: boolean
  /** Quantos dias DISTINTOS da série caíram nesta semana (0..7). Dia ausente ≠ dia com zero. */
  days: number
}

/**
 * Semana agregada: metadados + a soma de cada campo pedido em `sum` + o último
 * valor conhecido de cada campo pedido em `last`.
 *
 * Os campos de `last` são OPCIONAIS por natureza: uma semana pode não ter
 * nenhum dia com aquele campo (a série de seguidores do Spotify tem ~2 dias de
 * defasagem, então a semana corrente costuma chegar sem ele). Ausente ≠ zero —
 * zero significaria "perdeu todos os seguidores".
 */
export type WeekSummary<K extends string, L extends string = never> = WeekMeta &
  Record<K, number> &
  Partial<Record<L, number>>

/** Escopos de período do dashboard (D4). */
export const WEEK_SCOPES = ['last-12-weeks', 'year-to-date', 'all-time'] as const

export type WeekScope = (typeof WEEK_SCOPES)[number]

/** Campos somáveis de `T`, já excluídos os nomes reservados de `WeekMeta`. */
export type SummableKeys<T> = Exclude<NumericKeys<T>, keyof WeekMeta>

export interface ToWeeksOptions<K extends string, L extends string = never> {
  /**
   * Campos numéricos a SOMAR — contagens do dia (`starts`, `streams`, `views`,
   * `subscribersGained`/`Lost`). Somar o que a fonte conta por dia é correto.
   */
  sum: readonly K[]
  /**
   * Campos CUMULATIVOS, dos quais se pega o ÚLTIMO valor conhecido da semana —
   * nunca a soma. `followers` do Spotify é um total acumulado: somar sete dias
   * de ~3.350 seguidores daria ~23.450, um número que não significa nada.
   *
   * A variação (semanal ou de qualquer janela) é derivada pelo consumidor a
   * partir destes valores. Guardamos o total, que é a informação maior: de
   * totais se derivam variações, do contrário não.
   */
  last?: readonly L[]
  /**
   * "Hoje" em ISO UTC. Default: a data corrente em UTC.
   * Injetável para que os testes não dependam do relógio.
   */
  today?: IsoDate
  /** Escopo aplicado sobre as semanas já formadas. Default: `'all-time'`. */
  scope?: WeekScope
}

const MS_PER_DAY = 86_400_000
/** `getUTCDay()`: 0 = domingo … 3 = quarta. A semana do produtor abre na quarta (D6). */
const WEEK_START_DOW = 3

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Converte `'YYYY-MM-DD'` em milissegundos UTC da meia-noite daquele dia.
 * Falha alta em data malformada ou inexistente (`'2026-02-30'`) — série
 * corrompida deve estourar, não virar semana silenciosamente errada.
 */
function toUtcMs(iso: IsoDate): number {
  if (typeof iso !== 'string' || !ISO_DATE_RE.test(iso)) {
    throw new Error(`weekly: data ISO inválida: ${JSON.stringify(iso)}`)
  }
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  const ms = Date.UTC(year, month - 1, day)
  // Round-trip: rejeita 2026-02-30, 2026-13-01 etc., que Date.UTC normalizaria.
  if (fromUtcMs(ms) !== iso) {
    throw new Error(`weekly: data ISO inexistente: ${iso}`)
  }
  return ms
}

/** Formata milissegundos UTC como `'YYYY-MM-DD'` — só getters UTC. */
function fromUtcMs(ms: number): IsoDate {
  const d = new Date(ms)
  const year = String(d.getUTCFullYear()).padStart(4, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** A data de hoje em UTC, como ISO. */
export function todayUtc(now: Date = new Date()): IsoDate {
  return fromUtcMs(now.getTime())
}

/** A quarta-feira que abre a semana da data informada (a própria data, se for quarta). */
export function weekStartOf(date: IsoDate): IsoDate {
  const ms = toUtcMs(date)
  const dow = new Date(ms).getUTCDay()
  const offset = (dow - WEEK_START_DOW + 7) % 7
  return fromUtcMs(ms - offset * MS_PER_DAY)
}

/** A terça-feira que fecha a semana da data informada. */
export function weekEndOf(date: IsoDate): IsoDate {
  return fromUtcMs(toUtcMs(weekStartOf(date)) + 6 * MS_PER_DAY)
}

/**
 * Agrupa pontos diários em semanas de quarta a terça, somando os campos pedidos.
 *
 * - A ordem de entrada não importa: os pontos são agrupados por semana e a
 *   saída sai ordenada por `weekStart` crescente.
 * - **Só existem semanas com pelo menos um ponto.** Nenhuma semana vazia é
 *   fabricada entre dois buracos da série — dia ausente ≠ dia com zero, e
 *   `days` diz quantos dias distintos contribuíram.
 * - Pontos duplicados no mesmo dia somam os valores, mas contam 1 em `days`.
 * - Campo numérico ausente no ponto (opcional no schema) contribui 0, mas o dia
 *   continua contando em `days`.
 *
 * @example
 * toWeeks(spotifyDaily, { sum: ['starts', 'streams'], scope: 'last-12-weeks' })
 * // [{ weekStart: '2026-06-17', weekEnd: '2026-06-23', partial: false, days: 7, starts: 812, streams: 640 }, ...]
 */
export function toWeeks<
  T extends DailyPoint,
  K extends SummableKeys<T>,
  L extends SummableKeys<T> = never,
>(points: readonly T[], options: ToWeeksOptions<K, L>): WeekSummary<K, L>[] {
  const { sum, last = [] as readonly L[], scope = 'all-time' } = options
  const today = options.today ?? todayUtc()
  // Valida "hoje" cedo, mesmo com série vazia: erro de chamada não pode passar batido.
  const currentWeekStart = weekStartOf(today)

  const buckets = new Map<
    IsoDate,
    {
      totals: Map<K, number>
      dates: Set<IsoDate>
      /** Por campo cumulativo: o valor e a data em que ele foi visto. */
      latest: Map<L, { date: IsoDate; value: number }>
    }
  >()

  for (const point of points) {
    const start = weekStartOf(point.date)
    let bucket = buckets.get(start)
    if (!bucket) {
      bucket = { totals: new Map(sum.map((k) => [k, 0])), dates: new Set(), latest: new Map() }
      buckets.set(start, bucket)
    }
    bucket.dates.add(point.date)
    for (const key of sum) {
      const value = (point as Record<string, unknown>)[key]
      if (typeof value === 'number' && Number.isFinite(value)) {
        bucket.totals.set(key, (bucket.totals.get(key) ?? 0) + value)
      }
    }
    // Campos cumulativos: vence a MAIOR data que tenha o campo presente. A
    // ordem de entrada não importa — comparar a data é o que garante isso.
    for (const key of last) {
      const value = (point as Record<string, unknown>)[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const current = bucket.latest.get(key)
      if (!current || point.date > current.date) {
        bucket.latest.set(key, { date: point.date, value })
      }
    }
  }

  const weeks = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, bucket]) => {
      const week = {
        weekStart,
        weekEnd: fromUtcMs(toUtcMs(weekStart) + 6 * MS_PER_DAY),
        partial: weekStart === currentWeekStart,
        days: bucket.dates.size,
      } as WeekSummary<K, L>
      for (const key of sum) {
        ;(week as Record<string, unknown>)[key] = bucket.totals.get(key) ?? 0
      }
      // Campo cumulativo sem nenhum dia na semana fica AUSENTE, não zero:
      // zero leria como "perdeu todos os seguidores".
      for (const key of last) {
        const seen = bucket.latest.get(key)
        if (seen) (week as Record<string, unknown>)[key] = seen.value
      }
      return week
    })

  return filterWeeksByScope(weeks, scope, today)
}

/**
 * Aplica um escopo sobre semanas JÁ FORMADAS (D4) — nunca sobre dias soltos.
 *
 * - `'all-time'` — todo o período.
 * - `'last-12-weeks'` — as 12 últimas semanas **presentes na série** (não as 12
 *   últimas do calendário). Com série completa dá no mesmo; com série parada há
 *   meses, mostra as 12 últimas com dado em vez de um gráfico vazio.
 * - `'year-to-date'` — desde 1º de janeiro do ano de `today`. Entra toda semana
 *   que tenha ao menos um dia no ano corrente, inclusive a que atravessa o
 *   réveillon (senão os primeiros dias de janeiro sumiriam do gráfico).
 *
 * As semanas devem vir ordenadas por `weekStart` crescente (é o que `toWeeks` devolve).
 */
export function filterWeeksByScope<W extends WeekMeta>(
  weeks: readonly W[],
  scope: WeekScope,
  today: IsoDate = todayUtc()
): W[] {
  switch (scope) {
    case 'all-time':
      return [...weeks]
    case 'last-12-weeks':
      return weeks.slice(-12)
    case 'year-to-date': {
      const yearStart = `${todayYear(today)}-01-01`
      return weeks.filter((w) => w.weekEnd >= yearStart)
    }
    default: {
      const exhaustive: never = scope
      throw new Error(`weekly: escopo desconhecido: ${String(exhaustive)}`)
    }
  }
}

function todayYear(today: IsoDate): string {
  toUtcMs(today) // valida
  return today.slice(0, 4)
}

/**
 * Deriva a VARIAÇÃO de uma métrica cumulativa entre semanas consecutivas.
 *
 * Existe porque o painel do Spotify entrega o total de seguidores por dia e
 * **não separa ganhos de perdas** (provado pelo spike da story 31.2). De uma
 * série de totais só se deriva o líquido — daí o gráfico de seguidores ser
 * variação líquida em barra, que aceita valor negativo (área atravessando o
 * eixo é ilegível).
 *
 * A primeira semana com valor não tem anterior para comparar, então fica sem
 * variação. Semana sem o campo (a defasagem de ~2 dias da fonte) também fica
 * sem variação e **não quebra a cadeia**: a próxima semana com valor compara
 * com a última semana que teve valor, não com zero.
 */
export function withNetChange<W extends WeekMeta, K extends string, N extends string>(
  weeks: readonly (W & Partial<Record<K, number>>)[],
  key: K,
  outKey: N
): (W & Partial<Record<K, number>> & Partial<Record<N, number>>)[] {
  let previous: number | undefined
  return weeks.map((week) => {
    const value = week[key]
    const out = { ...week } as W &
      Partial<Record<K, number>> &
      Partial<Record<N, number>>
    if (typeof value === 'number') {
      if (previous !== undefined) {
        ;(out as Record<string, unknown>)[outKey] = value - previous
      }
      previous = value
    }
    return out
  })
}
