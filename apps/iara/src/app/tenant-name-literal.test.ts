/**
 * Trava: nenhuma tela escreve o nome de um podcast por extenso.
 *
 * O nome é configuração do tenant (`podcasts/{PODCAST_ID}.name`, lido por
 * `getPodcastName`) desde o começo do projeto. Com um único tenant, o literal e
 * o configurado renderizam igual — nenhum teste de componente enxerga a
 * diferença. Seis telas passaram assim até o 2º tenant (TrenDs News, set/2026)
 * subir e mostrar "PPT Não Compila" ao podcast errado. Esta varredura é o que
 * um teste de renderização não consegue ser: cega ao tenant que está rodando.
 *
 * Escopo: `src/app` e `src/components`, código de tela, fora os testes. Os
 * coletores do mediakit (`src/lib/mediakit`) ficam de fora de propósito: o
 * mediakit é do PPTNC e não roda em outro tenant.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

const ROOTS = ['src/app', 'src/components'].map((d) => resolve(process.cwd(), d))
const FORBIDDEN = /PPT N[ãa]o Compila|PPTNC/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return []
    return [full]
  })
}

describe('nome do podcast em texto de tela', () => {
  it('nenhum arquivo de src/app ou src/components escreve o nome por extenso', () => {
    const offenders = ROOTS.flatMap(sourceFiles).flatMap((file) =>
      readFileSync(file, 'utf-8')
        .split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        // Comentário não chega à tela — só texto renderizável conta.
        .filter(({ line }) => !/^(\/\/|\*|\/\*)/.test(line))
        .filter(({ line }) => FORBIDDEN.test(line))
        .map(({ line, n }) => `${relative(process.cwd(), file)}:${n}  ${line}`)
    )

    expect(offenders, 'use getPodcastName() — o nome é do tenant').toEqual([])
  })
})
