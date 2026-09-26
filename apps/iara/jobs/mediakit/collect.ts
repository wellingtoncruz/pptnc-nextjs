/**
 * Entrypoint do Cloud Run Job `mediakit-collector` (Epic 30).
 *
 * Asset APARTADO (arquitetura v4): roda os adapters em sequência com falha
 * isolada e sai. Disparo: Cloud Scheduler → API do Cloud Run (OIDC).
 * Imagem: `Dockerfile.mediakit-collector` (sem Chromium).
 *
 * Execução local (dev): npx tsx jobs/mediakit/collect.ts
 * Fontes por tenant: MEDIAKIT_ADAPTERS (ver `selectAdapters`).
 * Exit 0 = todos os adapters ok; 1 = pelo menos um falhou (os que passaram
 * JÁ escreveram — dado parcial é melhor que nenhum; o exit≠0 é o sinal de
 * monitoração).
 */
import { brightdataSocialsAdapter } from '../../src/lib/mediakit/collectors/brightdata-socials'
import { iaraCountsAdapter } from '../../src/lib/mediakit/collectors/iara-counts'
import { runCollectors, selectAdapters } from '../../src/lib/mediakit/collectors/runner'
import { spotifyAdapter } from '../../src/lib/mediakit/collectors/spotify'
import { youtubeAdapter } from '../../src/lib/mediakit/collectors/youtube'

const ALL_ADAPTERS = [iaraCountsAdapter, youtubeAdapter, spotifyAdapter, brightdataSocialsAdapter]

async function main() {
  // Por tenant: `MEDIAKIT_ADAPTERS=youtube,spotify`; sem a env, todos.
  const ADAPTERS = selectAdapters(ALL_ADAPTERS)
  console.log('[mediakit-collector] starting —', ADAPTERS.map((a) => a.name).join(', '))
  const report = await runCollectors(ADAPTERS)
  for (const adapter of report.adapters) {
    console.log(
      `[mediakit-collector] ${adapter.ok ? 'OK  ' : 'FAIL'} ${adapter.name}` +
        (adapter.ok ? ` → ${adapter.fields.join(', ')}` : ` → ${adapter.error}`)
    )
  }
  if (!report.ok) process.exit(1)
}

main().catch((error) => {
  console.error('[mediakit-collector] FATAL:', error instanceof Error ? error.message : error)
  process.exit(1)
})
