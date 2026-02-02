/**
 * Script para copiar subcollections `chunks` de produção para desenvolvimento.
 *
 * Os documentos principais já foram copiados anteriormente.
 * Este script copia apenas as subcollections.
 *
 * Produção: /videos/{videoId}/chunks
 * Desenvolvimento: /podcasts/pptnc/videos/{videoId}/chunks
 */

import { applicationDefault, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore, type DocumentData } from 'firebase-admin/firestore'

const PROJECT_ID = 'pptnc-stage'
const PROD_DATABASE_ID = 'pptnc'
const DEV_DATABASE_ID = 'pptnc-stage'
const PODCAST_ID = 'pptnc'

let prodDb: Firestore
let devDb: Firestore

function initializeFirebase(): void {
  console.log('Inicializando conexões Firebase...')
  console.log(`Projeto GCP: ${PROJECT_ID}`)

  const prodApp = initializeApp(
    { credential: applicationDefault(), projectId: PROJECT_ID },
    'production'
  )
  prodDb = getFirestore(prodApp, PROD_DATABASE_ID)
  console.log(`  Produção (database): ${PROD_DATABASE_ID}`)

  const devApp = initializeApp(
    { credential: applicationDefault(), projectId: PROJECT_ID },
    'development'
  )
  devDb = getFirestore(devApp, DEV_DATABASE_ID)
  console.log(`  Desenvolvimento (database): ${DEV_DATABASE_ID}`)
}

async function copyChunksSubcollections(): Promise<{ videos: number; chunks: number }> {
  console.log('\nBuscando documentos com subcollection chunks...')

  const prodVideosRef = prodDb.collection('videos')
  const snapshot = await prodVideosRef.get()

  console.log(`Total de documentos em /videos: ${snapshot.size}`)

  let videosWithChunks = 0
  let totalChunks = 0

  for (let i = 0; i < snapshot.docs.length; i++) {
    const doc = snapshot.docs[i]
    const videoId = doc.id

    // Check if this document has chunks subcollection
    const chunksRef = doc.ref.collection('chunks')
    const chunksSnapshot = await chunksRef.get()

    if (!chunksSnapshot.empty) {
      videosWithChunks++

      // Copy each chunk document to dev
      const devChunksRef = devDb
        .collection('podcasts')
        .doc(PODCAST_ID)
        .collection('videos')
        .doc(videoId)
        .collection('chunks')

      const batch = devDb.batch()
      for (const chunkDoc of chunksSnapshot.docs) {
        batch.set(devChunksRef.doc(chunkDoc.id), chunkDoc.data())
        totalChunks++
      }
      await batch.commit()

      console.log(`  ${videoId}: ${chunksSnapshot.size} chunks copiados`)
    }

    // Progress every 500 documents
    if ((i + 1) % 500 === 0) {
      console.log(`Progresso: ${i + 1}/${snapshot.size} documentos verificados`)
    }
  }

  return { videos: videosWithChunks, chunks: totalChunks }
}

async function main(): Promise<void> {
  console.log('='.repeat(50))
  console.log('  COPIAR SUBCOLLECTIONS CHUNKS')
  console.log('='.repeat(50))

  try {
    initializeFirebase()
    const result = await copyChunksSubcollections()

    console.log('\n' + '='.repeat(50))
    console.log('  RESUMO')
    console.log('='.repeat(50))
    console.log(`  Vídeos com chunks: ${result.videos}`)
    console.log(`  Total de chunks copiados: ${result.chunks}`)
    console.log('='.repeat(50))
    console.log('Concluído!')
  } catch (error) {
    console.error('\nErro:', error)
    process.exit(1)
  }
}

main()
