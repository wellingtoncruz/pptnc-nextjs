/**
 * Entrypoint do Cloud Run Job `mediakit-generator` (Epic 30).
 *
 * Asset APARTADO do serviço web (decisão de arquitetura 2026-08-26): roda até
 * o fim e sai — sem porta, sem HTTP, sem segredo; o disparo é do Cloud
 * Scheduler via API do Cloud Run (OIDC/IAM). Imagem própria:
 * `Dockerfile.mediakit-generator` (Chromium + template).
 *
 * Execução local (dev): npx tsx jobs/mediakit/generate.ts
 * Exit code 0 = PDF verificado e publicado; 1 = falha (o latest.pdf anterior
 * permanece — failsafe do pipeline).
 */
import { runMediakitGeneration } from '../../src/lib/mediakit/generate-pipeline'

async function main() {
  console.log('[mediakit-generator] starting')
  const report = await runMediakitGeneration()
  console.log('[mediakit-generator] done:', JSON.stringify(report))
}

main().catch((error) => {
  console.error(
    '[mediakit-generator] FAILED (previous latest.pdf preserved):',
    error instanceof Error ? error.message : error
  )
  process.exit(1)
})
