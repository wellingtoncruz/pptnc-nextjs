/**
 * Seed da collection `mediakit` (Epic 30, story 30.1).
 *
 * Escreve os 3 docs do contrato (`stats`, `audience`, `series`) com os valores
 * atuais do design (src/lib/mediakit/seed-values.ts — que também é o fixture
 * do golden test da 30.2).
 *
 * Uso:
 *   npx tsx scripts/seed-mediakit.ts            # dry-run (default)
 *   npx tsx scripts/seed-mediakit.ts --apply    # escreve (merge; idempotente)
 *
 * Banco: FIRESTORE_DATABASE_ID do ambiente (.env.local em dev).
 * BLOQUEIO: recusa `pptnc-prod` — aplicação em PROD é manual do Wellington.
 */
import {
  MEDIAKIT_SEED_AUDIENCE,
  MEDIAKIT_SEED_SERIES,
  MEDIAKIT_SEED_STATS,
} from '../src/lib/mediakit/seed-values'
import { writeMediakitSection, readMediakit } from '../src/lib/firebase/mediakit-admin'

async function main() {
  const apply = process.argv.includes('--apply')
  const databaseId = process.env.FIRESTORE_DATABASE_ID ?? '(default do config.ts)'

  if (process.env.FIRESTORE_DATABASE_ID === 'pptnc-prod') {
    console.error('✋ Este script NÃO roda em pptnc-prod — aplicação em PROD é manual.')
    process.exit(1)
  }

  console.log(`Banco alvo: ${databaseId}`)
  console.log('Docs a escrever: mediakit/{stats,audience,series} (merge, source="seed")')
  console.log('  stats   :', JSON.stringify(MEDIAKIT_SEED_STATS))
  console.log('  audience:', JSON.stringify(MEDIAKIT_SEED_AUDIENCE))
  console.log('  series  :', JSON.stringify(MEDIAKIT_SEED_SERIES))

  if (!apply) {
    console.log('\nDRY-RUN. Rode com --apply para escrever.')
    return
  }

  await writeMediakitSection('stats', MEDIAKIT_SEED_STATS, 'seed')
  await writeMediakitSection('audience', MEDIAKIT_SEED_AUDIENCE, 'seed')
  await writeMediakitSection('series', MEDIAKIT_SEED_SERIES, 'seed')

  const data = await readMediakit()
  const ok = data.stats !== null && data.audience !== null && data.series !== null
  console.log('\nVerificação pós-escrita (readMediakit):', ok ? 'OK — 3/3 seções válidas' : 'FALHOU')
  if (!ok) process.exit(1)
  console.log('  stats.episodes =', data.stats?.episodes)
  console.log('  audience.youtubeSubscribers =', data.audience?.youtubeSubscribers)
  console.log('  series diárias (vazias até a carga histórica dos coletores) =', {
    spotifyDaily: data.series?.spotifyDaily.length,
    youtubeWatchDaily: data.series?.youtubeWatchDaily.length,
  })
}

main().catch((error) => {
  console.error('Seed falhou:', error)
  process.exit(1)
})
