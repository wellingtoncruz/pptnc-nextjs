'use client'

import { useEffect, useMemo, useState } from 'react'

import { Sidebar } from '@/components/layout/sidebar'
import { ScopeSelector } from '@/components/dashboard/scope-selector'
import { WeeklyChart, type ChartWeek } from '@/components/dashboard/weekly-chart'
import { filterWeeksByScope, withNetChange, type WeekScope } from '@/lib/analytics/weekly'
import type { LLMProviderId } from '@/lib/llm/models'

import type { DashboardData } from './page'

interface PodcastFeatures {
  editorial?: boolean
  news?: boolean
  socialMedia?: boolean
  adwords?: boolean
  newsletter?: boolean
  socialPublish?: boolean
  llmDebugMode?: boolean
}

interface DashboardLayoutProps {
  userName?: string
  data: DashboardData
}

/**
 * Casca do Dashboard: sidebar + boas-vindas + grade 2×2.
 *
 * Os dados chegam JÁ AGREGADOS do Server Component — este componente não lê
 * Firestore nem conhece série diária. Ele só deriva o que é apresentação: a
 * variação líquida de cada plataforma e o recorte do escopo escolhido.
 *
 * As features do podcast são buscadas em `/api/podcast` do mesmo jeito que o
 * `videos-layout.tsx` faz (AI 33 — espelhar a mecânica): se o Dashboard
 * montasse a Sidebar com outra fonte, os itens de menu divergiriam entre as
 * abas conforme o que estivesse desabilitado.
 */
export function DashboardLayout({ userName, data }: DashboardLayoutProps) {
  // Um escopo POR LINHA do 2×2 (D4): o seletor da linha controla os dois
  // gráficos dela. Trocar o escopo é filtro de apresentação — não refaz busca.
  const [spotifyScope, setSpotifyScope] = useState<WeekScope>('last-12-weeks')
  const [youtubeScope, setYoutubeScope] = useState<WeekScope>('last-12-weeks')
  const [features, setFeatures] = useState<PodcastFeatures>()
  const [enabledSocialNetworks, setEnabledSocialNetworks] = useState<string[]>([])
  const [llmConfig, setLlmConfig] = useState<{ provider?: LLMProviderId; textModel?: string }>()

  useEffect(() => {
    fetch('/api/podcast')
      .then((r) => r.json())
      .then((d) => {
        if (d?.data?.features) setFeatures(d.data.features)
        if (d?.data?.enabledSocialNetworks) setEnabledSocialNetworks(d.data.enabledSocialNetworks)
        if (d?.data?.llmConfig) {
          setLlmConfig({
            provider: d.data.llmConfig.provider,
            textModel: d.data.llmConfig.textModel,
          })
        }
      })
      .catch(() => {
        // Sidebar sem features mostra todos os itens — degradação aceitável,
        // igual ao comportamento do videos-layout enquanto a chamada não volta.
      })
  }, [])

  // A variação líquida de seguidores é derivada ANTES do recorte de escopo:
  // a primeira semana da janela precisa da semana anterior para ter variação.
  const spotifyWeeks = useMemo(
    () =>
      filterWeeksByScope(
        withNetChange(data.spotify, 'followers', 'net'),
        spotifyScope
      ) as ChartWeek[],
    [data.spotify, spotifyScope]
  )

  // Líquido do YouTube = ganhos − perdas da própria semana (a fonte entrega as
  // duas parcelas separadas). Diferente do Spotify, onde o líquido vem da
  // diferença entre totais acumulados de semanas consecutivas.
  const youtubeWeeks = useMemo(
    () =>
      filterWeeksByScope(
        data.youtube.map((w) => ({
          ...w,
          net: w.subscribersGained - w.subscribersLost,
        })),
        youtubeScope
      ) as ChartWeek[],
    [data.youtube, youtubeScope]
  )

  const firstName = userName?.trim().split(/\s+/)[0]

  return (
    <div className="flex h-screen">
      <div className="shrink-0">
        <Sidebar
          userName={userName}
          features={features}
          enabledSocialNetworks={enabledSocialNetworks}
          llmConfig={llmConfig}
        />
      </div>

      <main className="flex-1 overflow-y-auto p-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            {firstName ? `Bem-vindo, ${firstName}` : 'Bem-vindo'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A evolução do PPT Não Compila, semana a semana — de quarta a terça.
          </p>
        </header>

        {data.unavailable ? (
          <div
            role="status"
            className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground"
          >
            As séries de métricas não puderam ser lidas agora. Os gráficos voltam assim que a
            próxima coleta rodar — nenhum dado foi perdido.
          </div>
        ) : (
          <div className="space-y-8">
            {/* Linha 1 — Spotify */}
            <section aria-label="Spotify">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold text-foreground">Spotify</h2>
                <ScopeSelector value={spotifyScope} onChange={setSpotifyScope} label="Spotify" />
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <WeeklyChart
                  title="Plays por semana"
                  weeks={spotifyWeeks}
                  series={[
                    { key: 'starts', label: 'Iniciados', type: 'area', tone: 1 },
                    { key: 'streams', label: 'Streams', type: 'area', tone: 2 },
                  ]}
                />
                <WeeklyChart
                  title="Seguidores ganhos por semana"
                  weeks={spotifyWeeks}
                  series={[{ key: 'net', label: 'Variação líquida', type: 'bar', tone: 3 }]}
                  emptyLabel="Sem variação de seguidores no período"
                />
              </div>
            </section>

            {/* Linha 2 — YouTube (story 31.6) */}
            <section aria-label="YouTube">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold text-foreground">YouTube</h2>
                <ScopeSelector value={youtubeScope} onChange={setYoutubeScope} label="YouTube" />
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <WeeklyChart
                  title="Views por semana"
                  weeks={youtubeWeeks}
                  series={[{ key: 'views', label: 'Views', type: 'area', tone: 4 }]}
                />
                <WeeklyChart
                  title="Inscritos por semana"
                  weeks={youtubeWeeks}
                  series={[
                    { key: 'subscribersGained', label: 'Ganhos', type: 'area', tone: 5 },
                    { key: 'net', label: 'Líquido', type: 'line', tone: 3 },
                  ]}
                />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
