/**
 * Script para deletar vídeos que NÃO estão com status 'sent' do Firestore.
 *
 * Uso: npx tsx scripts/delete-new-videos.ts [podcast-id]
 *
 * Argumentos:
 *   podcast-id - O ID do podcast (default: pptnc)
 *
 * Requer Application Default Credentials configuradas no ambiente.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Configurações do projeto (de src/lib/firebase/config.ts)
const PROJECT_ID = 'pptnc-stage'
const FIRESTORE_DATABASE_ID = 'pptnc-stage'

async function main() {
  const PODCAST_ID = process.argv[2] || 'pptnc'

  console.log('📋 Configurações:')
  console.log(`   - Project ID: ${PROJECT_ID}`)
  console.log(`   - Database ID: ${FIRESTORE_DATABASE_ID}`)
  console.log(`   - Podcast ID: ${PODCAST_ID}`)
  console.log('')

  // Initialize Firebase with Application Default Credentials
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  })

  // Get Firestore with specific database ID
  const db = getFirestore(app, FIRESTORE_DATABASE_ID)

  // Query ALL videos, then filter out 'sent' (Firestore doesn't support != directly)
  const videosRef = db.collection(`podcasts/${PODCAST_ID}/videos`)
  const snapshot = await videosRef.get()

  // Filter videos that are NOT 'sent'
  const videosToDelete = snapshot.docs.filter(doc => {
    const data = doc.data()
    return data.status !== 'sent'
  })

  if (videosToDelete.length === 0) {
    console.log('✅ Nenhum vídeo para deletar (todos já estão com status "sent").')
    return
  }

  console.log(`🔍 Encontrados ${videosToDelete.length} vídeos com status != "sent":`)

  // List videos before deleting
  for (const doc of videosToDelete) {
    const data = doc.data()
    console.log(`  - ${doc.id}: ${data.title} (status: ${data.status}, type: ${data.videoType || 'unknown'})`)
  }

  console.log('')
  console.log('🗑️  Deletando...')

  // Delete in batches (max 500 per batch)
  const BATCH_SIZE = 500
  let totalDeleted = 0

  for (let i = 0; i < videosToDelete.length; i += BATCH_SIZE) {
    const batch = db.batch()
    const chunk = videosToDelete.slice(i, i + BATCH_SIZE)

    for (const doc of chunk) {
      batch.delete(doc.ref)
    }

    await batch.commit()
    totalDeleted += chunk.length
    console.log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${chunk.length} deletados`)
  }

  console.log(`\n✅ ${totalDeleted} vídeos deletados com sucesso!`)
}

main().catch((error) => {
  console.error('❌ Erro:', error.message || error)
  process.exit(1)
})
