/**
 * Script para reconstruir a base de dados de desenvolvimento.
 *
 * Copia dados de produção (pptnc) para desenvolvimento (pptnc-stage):
 * - Produção: /videos/{videoId} + subcollections
 * - Desenvolvimento: /podcasts/pptnc/videos/{videoId} + subcollections
 *
 * SEGURANÇA: NUNCA altera dados em produção (pptnc)
 *
 * Uso: npx tsx scripts/rebuild-dev-database.ts
 */

import { applicationDefault, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore, type DocumentData } from 'firebase-admin/firestore'

// ============================================
// Configuration
// ============================================

// Mesmo projeto GCP para ambos
const PROJECT_ID = 'pptnc-stage'

// Databases Firestore diferentes
const PROD_DATABASE_ID = 'pptnc' // Produção
const DEV_DATABASE_ID = 'pptnc-stage' // Desenvolvimento

const PODCAST_ID = 'pptnc'

// Known subcollections in videos (verificado na produção)
const VIDEO_SUBCOLLECTIONS = ['chunks']

// ============================================
// Firebase Initialization
// ============================================

let prodApp: App
let devApp: App
let prodDb: Firestore
let devDb: Firestore

function initializeFirebase(): void {
  console.log('🔧 Inicializando conexões Firebase...')
  console.log(`   Projeto GCP: ${PROJECT_ID}`)

  // Production database (READ ONLY!)
  prodApp = initializeApp(
    {
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    },
    'production'
  )
  prodDb = getFirestore(prodApp, PROD_DATABASE_ID)
  console.log(`  ✅ Produção (database): ${PROD_DATABASE_ID}`)

  // Development database (READ/WRITE)
  devApp = initializeApp(
    {
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    },
    'development'
  )
  devDb = getFirestore(devApp, DEV_DATABASE_ID)
  console.log(`  ✅ Desenvolvimento (database): ${DEV_DATABASE_ID}`)
}

// ============================================
// Delete Operations (DEV ONLY)
// ============================================

async function deleteSubcollections(
  db: Firestore,
  docRef: FirebaseFirestore.DocumentReference
): Promise<number> {
  let deletedCount = 0

  for (const subcollectionName of VIDEO_SUBCOLLECTIONS) {
    const subcollectionRef = docRef.collection(subcollectionName)
    const snapshot = await subcollectionRef.get()

    if (!snapshot.empty) {
      const batch = db.batch()
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref)
        deletedCount++
      }
      await batch.commit()
    }
  }

  return deletedCount
}

async function deleteAllDevVideos(): Promise<{ docs: number; subdocs: number }> {
  console.log('\n🗑️  Excluindo documentos em desenvolvimento...')
  console.log(`   Path: /podcasts/${PODCAST_ID}/videos`)

  const videosRef = devDb.collection('podcasts').doc(PODCAST_ID).collection('videos')
  const snapshot = await videosRef.get()

  if (snapshot.empty) {
    console.log('   Nenhum documento encontrado.')
    return { docs: 0, subdocs: 0 }
  }

  console.log(`   Encontrados: ${snapshot.size} documentos`)

  let deletedDocs = 0
  let deletedSubdocs = 0

  // Process in batches of 100
  const docs = snapshot.docs
  for (let i = 0; i < docs.length; i += 100) {
    const batchDocs = docs.slice(i, i + 100)
    const batch = devDb.batch()

    for (const doc of batchDocs) {
      // Delete subcollections first
      const subdocCount = await deleteSubcollections(devDb, doc.ref)
      deletedSubdocs += subdocCount

      // Then delete the document
      batch.delete(doc.ref)
      deletedDocs++
    }

    await batch.commit()
    console.log(`   Progresso: ${deletedDocs}/${snapshot.size} documentos`)
  }

  console.log(`   ✅ Excluídos: ${deletedDocs} documentos, ${deletedSubdocs} subdocumentos`)
  return { docs: deletedDocs, subdocs: deletedSubdocs }
}

// ============================================
// Read Operations (PROD - READ ONLY)
// ============================================

interface VideoWithSubcollections {
  id: string
  data: DocumentData
  subcollections: Record<string, Array<{ id: string; data: DocumentData }>>
}

async function readSubcollections(
  docRef: FirebaseFirestore.DocumentReference
): Promise<Record<string, Array<{ id: string; data: DocumentData }>>> {
  const subcollections: Record<string, Array<{ id: string; data: DocumentData }>> = {}

  for (const subcollectionName of VIDEO_SUBCOLLECTIONS) {
    const subcollectionRef = docRef.collection(subcollectionName)
    const snapshot = await subcollectionRef.get()

    if (!snapshot.empty) {
      subcollections[subcollectionName] = snapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data(),
      }))
    }
  }

  return subcollections
}

async function readAllProdVideos(): Promise<VideoWithSubcollections[]> {
  console.log('\n📖 Lendo documentos de produção...')
  console.log(`   Path: /videos`)

  const videosRef = prodDb.collection('videos')
  const snapshot = await videosRef.get()

  if (snapshot.empty) {
    console.log('   Nenhum documento encontrado.')
    return []
  }

  console.log(`   Encontrados: ${snapshot.size} documentos`)

  const videos: VideoWithSubcollections[] = []

  for (let i = 0; i < snapshot.docs.length; i++) {
    const doc = snapshot.docs[i]
    const subcollections = await readSubcollections(doc.ref)

    videos.push({
      id: doc.id,
      data: doc.data(),
      subcollections,
    })

    if ((i + 1) % 50 === 0) {
      console.log(`   Progresso: ${i + 1}/${snapshot.size} documentos lidos`)
    }
  }

  // Count subcollections
  let totalSubdocs = 0
  for (const video of videos) {
    for (const subcollectionDocs of Object.values(video.subcollections)) {
      totalSubdocs += subcollectionDocs.length
    }
  }

  console.log(`   ✅ Lidos: ${videos.length} documentos, ${totalSubdocs} subdocumentos`)
  return videos
}

// ============================================
// Write Operations (DEV ONLY)
// ============================================

async function writeAllDevVideos(videos: VideoWithSubcollections[]): Promise<{
  docs: number
  subdocs: number
}> {
  console.log('\n💾 Escrevendo documentos em desenvolvimento...')
  console.log(`   Path: /podcasts/${PODCAST_ID}/videos`)

  if (videos.length === 0) {
    console.log('   Nenhum documento para escrever.')
    return { docs: 0, subdocs: 0 }
  }

  let writtenDocs = 0
  let writtenSubdocs = 0

  const videosRef = devDb.collection('podcasts').doc(PODCAST_ID).collection('videos')

  // Process in batches of 100 (Firestore limit is 500, but being conservative)
  for (let i = 0; i < videos.length; i += 100) {
    const batchVideos = videos.slice(i, i + 100)
    const batch = devDb.batch()

    for (const video of batchVideos) {
      const docRef = videosRef.doc(video.id)
      batch.set(docRef, video.data)
      writtenDocs++
    }

    await batch.commit()

    // Write subcollections separately (can't be in same batch as parent)
    for (const video of batchVideos) {
      const docRef = videosRef.doc(video.id)

      for (const [subcollectionName, subdocs] of Object.entries(video.subcollections)) {
        if (subdocs.length > 0) {
          const subBatch = devDb.batch()
          for (const subdoc of subdocs) {
            const subdocRef = docRef.collection(subcollectionName).doc(subdoc.id)
            subBatch.set(subdocRef, subdoc.data)
            writtenSubdocs++
          }
          await subBatch.commit()
        }
      }
    }

    console.log(`   Progresso: ${writtenDocs}/${videos.length} documentos`)
  }

  console.log(`   ✅ Escritos: ${writtenDocs} documentos, ${writtenSubdocs} subdocumentos`)
  return { docs: writtenDocs, subdocs: writtenSubdocs }
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  console.log('═'.repeat(60))
  console.log('  REBUILD DEV DATABASE')
  console.log('  Produção → Desenvolvimento')
  console.log('═'.repeat(60))

  try {
    initializeFirebase()

    // Step 1: Delete all dev videos
    const deleted = await deleteAllDevVideos()

    // Step 2: Read all prod videos
    const videos = await readAllProdVideos()

    // Step 3: Write to dev
    const written = await writeAllDevVideos(videos)

    // Summary
    console.log('\n' + '═'.repeat(60))
    console.log('  RESUMO')
    console.log('═'.repeat(60))
    console.log(`  Excluídos (dev): ${deleted.docs} docs, ${deleted.subdocs} subdocs`)
    console.log(`  Copiados:        ${written.docs} docs, ${written.subdocs} subdocs`)
    console.log('═'.repeat(60))
    console.log('✅ Concluído com sucesso!')
  } catch (error) {
    console.error('\n❌ Erro:', error)
    process.exit(1)
  }
}

main()
