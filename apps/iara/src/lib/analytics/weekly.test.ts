import { describe, it, expect, afterEach } from 'vitest'

import {
  WEEK_SCOPES,
  filterWeeksByScope,
  toWeeks,
  todayUtc,
  weekEndOf,
  weekStartOf,
  type WeekScope,
} from './weekly'

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000

/** Soma `n` dias a uma data ISO, em UTC (usado só para montar fixtures). */
function plusDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + n * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Série diária contínua de `count` dias a partir de `start`, com valor fixo. */
function dailyRange(start: string, count: number, value = 1) {
  return Array.from({ length: count }, (_, i) => ({
    date: plusDays(start, i),
    starts: value,
    streams: value * 2,
  }))
}

// Formatos reais das 4 séries do dashboard (D1/D2), para provar a generalização.
type SpotifyPoint = { date: string; starts: number; streams: number }
type YoutubePoint = { date: string; minutes: number; views?: number }
type YoutubeSubsPoint = {
  date: string
  minutes: number
  views: number
  subscribersGained: number
  subscribersLost: number
}

// ---------------------------------------------------------------------------

describe('weekStartOf / weekEndOf (D6 — quarta a terça)', () => {
  it('2021-09-01, primeiro dia das séries, é quarta e abre a própria semana', () => {
    expect(weekStartOf('2021-09-01')).toBe('2021-09-01')
    expect(weekEndOf('2021-09-01')).toBe('2021-09-07')
  })

  it('cada dia da semana cai na quarta anterior (ou nele mesmo)', () => {
    // 2021-09-01 (qua) .. 2021-09-07 (ter) formam UMA semana
    for (let i = 0; i < 7; i++) {
      expect(weekStartOf(plusDays('2021-09-01', i))).toBe('2021-09-01')
      expect(weekEndOf(plusDays('2021-09-01', i))).toBe('2021-09-07')
    }
    // a quarta seguinte já é outra semana
    expect(weekStartOf('2021-09-08')).toBe('2021-09-08')
  })

  it('atravessa virada de mês e de ano sem tropeçar', () => {
    expect(weekStartOf('2026-01-01')).toBe('2025-12-31') // quinta -> quarta anterior
    expect(weekEndOf('2026-01-01')).toBe('2026-01-06')
    expect(weekStartOf('2024-02-29')).toBe('2024-02-28') // ano bissexto
  })

  it('rejeita data malformada ou inexistente (falha alta, não semana errada)', () => {
    expect(() => weekStartOf('2026-13-01')).toThrow(/inexistente|inválida/)
    expect(() => weekStartOf('2026-02-30')).toThrow(/inexistente/)
    expect(() => weekStartOf('01/09/2021')).toThrow(/inválida/)
    expect(() => weekStartOf('2021-9-1')).toThrow(/inválida/)
    // @ts-expect-error entrada não-string deve estourar em runtime também
    expect(() => weekStartOf(undefined)).toThrow(/inválida/)
  })
})

describe('cálculo em UTC (AC 4 — a armadilha de fuso)', () => {
  const originalTz = process.env.TZ

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  it('o dia-da-semana LOCAL realmente muda com o fuso — é essa a armadilha', () => {
    // Este teste documenta o bug que o módulo evita: `new Date('YYYY-MM-DD')` é
    // meia-noite UTC, e ler com getters LOCAIS desloca o dia em fusos negativos.
    process.env.TZ = 'Pacific/Kiritimati' // UTC+14
    const eastern = new Date('2021-09-01').getDay()
    process.env.TZ = 'Pacific/Pago_Pago' // UTC-11
    const western = new Date('2021-09-01').getDay()

    expect(eastern).toBe(3) // quarta
    expect(western).toBe(2) // terça — a semana inteira deslizaria um dia
    expect(eastern).not.toBe(western)
  })

  it('toWeeks devolve o MESMO resultado em UTC+14, UTC-11 e UTC', () => {
    const points = dailyRange('2021-09-01', 14)
    const run = (tz: string) => {
      process.env.TZ = tz
      return toWeeks(points, { sum: ['starts'], today: '2026-09-04' })
    }

    const kiritimati = run('Pacific/Kiritimati') // UTC+14
    const pagoPago = run('Pacific/Pago_Pago') // UTC-11
    const saoPaulo = run('America/Sao_Paulo') // UTC-3 (fuso do produtor)
    const utc = run('UTC')

    expect(utc.map((w) => w.weekStart)).toEqual(['2021-09-01', '2021-09-08'])
    expect(kiritimati).toEqual(utc)
    expect(pagoPago).toEqual(utc)
    expect(saoPaulo).toEqual(utc)
    expect(utc.every((w) => w.days === 7)).toBe(true)
  })

  it('weekStartOf não escorrega nas bordas do dia em fuso negativo', () => {
    process.env.TZ = 'Pacific/Pago_Pago'
    expect(weekStartOf('2021-09-01')).toBe('2021-09-01')
    expect(weekStartOf('2021-09-07')).toBe('2021-09-01')
    expect(weekStartOf('2021-09-08')).toBe('2021-09-08')
  })

  it('todayUtc lê a data em UTC, não a local', () => {
    // 2026-09-04T02:00Z é ainda 2026-09-03 em São Paulo (UTC-3).
    process.env.TZ = 'America/Sao_Paulo'
    expect(todayUtc(new Date('2026-09-04T02:00:00.000Z'))).toBe('2026-09-04')
  })
})

describe('toWeeks — agregação (AC 1)', () => {
  it('soma os campos pedidos e reporta a janela da semana', () => {
    const weeks = toWeeks(
      [
        { date: '2021-09-01', starts: 1, streams: 10 },
        { date: '2021-09-04', starts: 2, streams: 20 },
        { date: '2021-09-07', starts: 3, streams: 30 },
        { date: '2021-09-08', starts: 4, streams: 40 },
      ] satisfies SpotifyPoint[],
      { sum: ['starts', 'streams'], today: '2026-09-04' }
    )

    expect(weeks).toEqual([
      {
        weekStart: '2021-09-01',
        weekEnd: '2021-09-07',
        partial: false,
        days: 3,
        starts: 6,
        streams: 60,
      },
      {
        weekStart: '2021-09-08',
        weekEnd: '2021-09-14',
        partial: false,
        days: 1,
        starts: 4,
        streams: 40,
      },
    ])
  })

  it('é genérica sobre os campos: as 4 séries do dashboard usam a MESMA função', () => {
    const spotify = toWeeks<SpotifyPoint, 'starts' | 'streams'>(
      [{ date: '2026-08-26', starts: 5, streams: 7 }],
      { sum: ['starts', 'streams'], today: '2026-09-04' }
    )
    expect(spotify[0].starts).toBe(5)
    expect(spotify[0].streams).toBe(7)

    const youtube = toWeeks<YoutubePoint, 'minutes' | 'views'>(
      [{ date: '2026-08-26', minutes: 100, views: 9 }],
      { sum: ['minutes', 'views'], today: '2026-09-04' }
    )
    expect(youtube[0].minutes).toBe(100)
    expect(youtube[0].views).toBe(9)

    const subs = toWeeks<YoutubeSubsPoint, 'subscribersGained' | 'subscribersLost'>(
      [
        {
          date: '2026-08-26',
          minutes: 1,
          views: 1,
          subscribersGained: 12,
          subscribersLost: 3,
        },
      ],
      { sum: ['subscribersGained', 'subscribersLost'], today: '2026-09-04' }
    )
    expect(subs[0].subscribersGained).toBe(12)
    expect(subs[0].subscribersLost).toBe(3)

    // Série ainda-a-definir do Spotify (31.2): basta nomear o campo novo.
    const futura = toWeeks(
      [{ date: '2026-08-26', followers: 3358 }],
      { sum: ['followers'], today: '2026-09-04' }
    )
    expect(futura[0].followers).toBe(3358)
  })

  it('não depende da ordem de entrada e devolve as semanas em ordem crescente', () => {
    const embaralhado = [
      { date: '2021-09-15', starts: 3, streams: 0 },
      { date: '2021-09-01', starts: 1, streams: 0 },
      { date: '2021-09-08', starts: 2, streams: 0 },
    ]
    const weeks = toWeeks(embaralhado, { sum: ['starts'], today: '2026-09-04' })
    expect(weeks.map((w) => w.weekStart)).toEqual([
      '2021-09-01',
      '2021-09-08',
      '2021-09-15',
    ])
    expect(weeks.map((w) => w.starts)).toEqual([1, 2, 3])
  })

  it('pontos duplicados no mesmo dia somam, mas o dia conta uma vez só', () => {
    const weeks = toWeeks(
      [
        { date: '2021-09-01', starts: 1 },
        { date: '2021-09-01', starts: 4 },
      ],
      { sum: ['starts'], today: '2026-09-04' }
    )
    expect(weeks[0].starts).toBe(5)
    expect(weeks[0].days).toBe(1)
  })

  it('campo opcional ausente contribui 0, mas o dia continua contando', () => {
    const weeks = toWeeks<YoutubePoint, 'minutes' | 'views'>(
      [
        { date: '2021-09-01', minutes: 10 }, // sem `views` (ponto legado)
        { date: '2021-09-02', minutes: 5, views: 7 },
      ],
      { sum: ['minutes', 'views'], today: '2026-09-04' }
    )
    expect(weeks[0].views).toBe(7)
    expect(weeks[0].minutes).toBe(15)
    expect(weeks[0].days).toBe(2)
  })

  it('ignora valores não-finitos em vez de propagar NaN para o gráfico', () => {
    const weeks = toWeeks(
      [
        { date: '2021-09-01', starts: 5 },
        { date: '2021-09-02', starts: Number.NaN },
        { date: '2021-09-03', starts: Number.POSITIVE_INFINITY },
      ],
      { sum: ['starts'], today: '2026-09-04' }
    )
    expect(weeks[0].starts).toBe(5)
    expect(weeks[0].days).toBe(3)
  })
})

describe('toWeeks — semana parcial (AC 2 / D3)', () => {
  it('marca como parcial APENAS a semana que contém hoje', () => {
    // 2026-09-04 é sexta; a semana corrente abre em 2026-09-02 (quarta).
    const points = dailyRange('2026-08-19', 17) // 2026-08-19 .. 2026-09-04
    const weeks = toWeeks(points, { sum: ['starts'], today: '2026-09-04' })

    expect(weeks.map((w) => w.weekStart)).toEqual([
      '2026-08-19',
      '2026-08-26',
      '2026-09-02',
    ])
    expect(weeks.map((w) => w.partial)).toEqual([false, false, true])
    expect(weeks.filter((w) => w.partial)).toHaveLength(1)
    expect(weeks.at(-1)!.days).toBe(3) // qua, qui, sex — 3 de 7
  })

  it('a semana parcial é a de hoje mesmo quando há dias futuros na série', () => {
    // O Spotify entrega um dia à frente (fuso da plataforma): 2026-09-05 cai na
    // MESMA semana corrente e não cria uma semana futura marcada por engano.
    const weeks = toWeeks(
      [
        { date: '2026-09-02', starts: 1 },
        { date: '2026-09-05', starts: 1 },
      ],
      { sum: ['starts'], today: '2026-09-04' }
    )
    expect(weeks).toHaveLength(1)
    expect(weeks[0]).toMatchObject({ weekStart: '2026-09-02', partial: true, days: 2 })
  })

  it('nenhuma semana é parcial quando a série parou antes da semana corrente', () => {
    const weeks = toWeeks(dailyRange('2021-09-01', 14), {
      sum: ['starts'],
      today: '2026-09-04',
    })
    expect(weeks.some((w) => w.partial)).toBe(false)
  })

  it('a semana que fecha exatamente hoje (terça) ainda é parcial: o dia não acabou', () => {
    // 2026-09-08 é terça, último dia da semana aberta em 2026-09-02.
    const weeks = toWeeks(dailyRange('2026-09-02', 7), {
      sum: ['starts'],
      today: '2026-09-08',
    })
    expect(weeks[0]).toMatchObject({ weekEnd: '2026-09-08', partial: true, days: 7 })
  })

  it('sem `today`, usa a data corrente em UTC', () => {
    const hoje = todayUtc()
    const weeks = toWeeks([{ date: hoje, starts: 1 }], { sum: ['starts'] })
    expect(weeks[0].partial).toBe(true)
  })
})

describe('escopos (AC 3 / D4)', () => {
  // 30 semanas contínuas terminando na semana de 2026-09-02.
  const points = dailyRange('2026-02-11', 30 * 7)

  it('all-time devolve todas as semanas formadas', () => {
    const weeks = toWeeks(points, {
      sum: ['starts'],
      today: '2026-09-04',
      scope: 'all-time',
    })
    expect(weeks).toHaveLength(30)
    expect(weeks[0].weekStart).toBe('2026-02-11')
  })

  it('last-12-weeks devolve as 12 últimas semanas', () => {
    const weeks = toWeeks(points, {
      sum: ['starts'],
      today: '2026-09-04',
      scope: 'last-12-weeks',
    })
    expect(weeks).toHaveLength(12)
    expect(weeks.at(-1)!.weekStart).toBe('2026-09-02')
    expect(weeks[0].weekStart).toBe('2026-06-17') // 11 semanas antes
  })

  it('last-12-weeks devolve tudo quando há menos de 12 semanas', () => {
    const curta = toWeeks(dailyRange('2026-08-19', 14), {
      sum: ['starts'],
      today: '2026-09-04',
      scope: 'last-12-weeks',
    })
    expect(curta).toHaveLength(2)
  })

  it('year-to-date corta em 1º de janeiro do ano de hoje', () => {
    const cincoAnos = dailyRange('2021-09-01', 1831)
    const weeks = toWeeks(cincoAnos, {
      sum: ['starts'],
      today: '2026-09-04',
      scope: 'year-to-date',
    })
    expect(weeks.every((w) => w.weekEnd >= '2026-01-01')).toBe(true)
    // A semana que atravessa o réveillon ENTRA — senão os primeiros dias do ano
    // sumiriam do gráfico. 2025-12-31 é quarta.
    expect(weeks[0].weekStart).toBe('2025-12-31')
    expect(weeks[0].weekEnd).toBe('2026-01-06')
  })

  it('escopo sem nenhuma semana devolve lista vazia, sem quebrar (AC 6)', () => {
    const soAnoPassado = toWeeks(dailyRange('2025-01-08', 60), {
      sum: ['starts'],
      today: '2026-09-04',
      scope: 'year-to-date',
    })
    expect(soAnoPassado).toEqual([])
  })

  it('o filtro opera sobre semanas já formadas, nunca sobre dias soltos', () => {
    // Recortar dias primeiro produziria uma semana truncada na borda esquerda;
    // recortando semanas, toda semana devolvida mantém seus 7 dias.
    const weeks = toWeeks(points, {
      sum: ['starts'],
      today: '2026-09-04',
      scope: 'last-12-weeks',
    })
    expect(weeks.slice(0, -1).every((w) => w.days === 7)).toBe(true)
  })

  it('filterWeeksByScope é reutilizável isolado e cobre todos os escopos', () => {
    const weeks = toWeeks(points, { sum: ['starts'], today: '2026-09-04' })
    for (const scope of WEEK_SCOPES) {
      expect(filterWeeksByScope(weeks, scope, '2026-09-04').length).toBeGreaterThan(0)
    }
    expect(filterWeeksByScope([], 'all-time', '2026-09-04')).toEqual([])
    expect(() =>
      filterWeeksByScope(weeks, 'ultimo-mes' as WeekScope, '2026-09-04')
    ).toThrow(/escopo desconhecido/)
  })
})

describe('bordas da série (AC 6)', () => {
  it('série vazia devolve lista vazia em qualquer escopo', () => {
    for (const scope of WEEK_SCOPES) {
      expect(
        toWeeks([] as SpotifyPoint[], { sum: ['starts'], today: '2026-09-04', scope })
      ).toEqual([])
    }
  })

  it('série de um único dia devolve uma semana com days = 1', () => {
    const weeks = toWeeks([{ date: '2021-09-03', starts: 42 }], {
      sum: ['starts'],
      today: '2026-09-04',
    })
    expect(weeks).toEqual([
      {
        weekStart: '2021-09-01',
        weekEnd: '2021-09-07',
        partial: false,
        days: 1,
        starts: 42,
      },
    ])
  })

  it('buraco no meio da semana: soma o que existe e conta os dias presentes', () => {
    const weeks = toWeeks(
      [
        { date: '2021-09-01', starts: 1 },
        { date: '2021-09-02', starts: 1 },
        // 09-03 e 09-04 AUSENTES — não são zeros
        { date: '2021-09-05', starts: 1 },
        { date: '2021-09-06', starts: 1 },
        { date: '2021-09-07', starts: 1 },
      ],
      { sum: ['starts'], today: '2026-09-04' }
    )
    expect(weeks[0].days).toBe(5)
    expect(weeks[0].starts).toBe(5)
  })

  it('dia ausente ≠ dia com zero: mesma soma, days diferente', () => {
    const comZeros = toWeeks(
      [
        { date: '2021-09-01', starts: 3 },
        { date: '2021-09-02', starts: 0 },
        { date: '2021-09-03', starts: 0 },
      ],
      { sum: ['starts'], today: '2026-09-04' }
    )
    const semOsDias = toWeeks([{ date: '2021-09-01', starts: 3 }], {
      sum: ['starts'],
      today: '2026-09-04',
    })
    expect(comZeros[0].starts).toBe(semOsDias[0].starts)
    expect(comZeros[0].days).toBe(3)
    expect(semOsDias[0].days).toBe(1)
  })

  it('semana inteira ausente NÃO é fabricada entre duas semanas com dado', () => {
    const weeks = toWeeks(
      [
        { date: '2021-09-01', starts: 1 },
        // semana de 2021-09-08 inteira ausente
        { date: '2021-09-15', starts: 1 },
      ],
      { sum: ['starts'], today: '2026-09-04' }
    )
    expect(weeks.map((w) => w.weekStart)).toEqual(['2021-09-01', '2021-09-15'])
  })

  it('`sum` vazio ainda devolve a grade de semanas (só metadados)', () => {
    const weeks = toWeeks([{ date: '2021-09-01' }], { sum: [], today: '2026-09-04' })
    expect(weeks).toEqual([
      { weekStart: '2021-09-01', weekEnd: '2021-09-07', partial: false, days: 1 },
    ])
  })

  it('data inválida na série estoura em vez de virar semana errada', () => {
    expect(() =>
      toWeeks([{ date: '2021-09-31', starts: 1 }], {
        sum: ['starts'],
        today: '2026-09-04',
      })
    ).toThrow(/inexistente/)
  })

  it('`today` inválido estoura mesmo com série vazia', () => {
    expect(() =>
      toWeeks([] as SpotifyPoint[], { sum: ['starts'], today: 'ontem' })
    ).toThrow(/inválida/)
  })
})

describe('invariantes de bordas sobre a série completa (AC 5, espelho sintético)', () => {
  // A verificação com o dado REAL de produção está registrada no story file
  // (1.831 pontos do Spotify + 1.828 do YouTube). Este teste congela as MESMAS
  // três invariantes numa série sintética equivalente, para que qualquer
  // regressão futura quebre a suíte sem depender da rede.
  const spotify = Array.from({ length: 1831 }, (_, i) => ({
    date: plusDays('2021-09-01', i),
    starts: i % 37,
    streams: i % 53,
  }))

  const weeks = toWeeks(spotify, {
    sum: ['starts', 'streams'],
    today: '2026-09-04',
  })

  it('a primeira semana começa exatamente em 2021-09-01', () => {
    expect(weeks[0].weekStart).toBe('2021-09-01')
    expect(weeks[0].days).toBe(7) // borda esquerda fecha exata (D6)
  })

  it('nenhum dia fica fora de alguma semana', () => {
    const totalDias = weeks.reduce((acc, w) => acc + w.days, 0)
    expect(totalDias).toBe(spotify.length)

    const janelas = weeks.map((w) => [w.weekStart, w.weekEnd] as const)
    for (const p of spotify) {
      const dentro = janelas.some(([ini, fim]) => p.date >= ini && p.date <= fim)
      expect(dentro).toBe(true)
    }
  })

  it('a soma das semanas é igual à soma dos dias', () => {
    for (const campo of ['starts', 'streams'] as const) {
      const somaDias = spotify.reduce((acc, p) => acc + p[campo], 0)
      const somaSemanas = weeks.reduce((acc, w) => acc + w[campo], 0)
      expect(somaSemanas).toBe(somaDias)
    }
  })

  it('as semanas são contíguas e não se sobrepõem', () => {
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i].weekStart).toBe(plusDays(weeks[i - 1].weekEnd, 1))
      expect(weeks[i].weekEnd).toBe(plusDays(weeks[i].weekStart, 6))
    }
  })
})
