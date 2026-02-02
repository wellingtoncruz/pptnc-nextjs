/**
 * Script para listar subcollections existentes em /videos na produção.
 */

import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'pptnc-stage'
const PROD_DATABASE_ID = 'pptnc'

async function main(): Promise<void> {
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  })
  const db = getFirestore(app, PROD_DATABASE_ID)

  console.log('Buscando documentos em /videos...')
  const videosRef = db.collection('videos')
  const snapshot = await videosRef.limit(100).get()

  console.log(`\nAnalisando ${snapshot.size} documentos para subcollections...\n`)

  const subcollectionCounts: Record<string, number> = {}

  for (const doc of snapshot.docs) {
    // List all subcollections for this document
    const subcollections = await doc.ref.listCollections()

    for (const subcol of subcollections) {
      const name = subcol.id
      subcollectionCounts[name] = (subcollectionCounts[name] || 0) + 1
    }
  }

  console.log('Subcollections encontradas:')
  console.log('===========================')
  for (const [name, count] of Object.entries(subcollectionCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count} documentos`)
  }

  if (Object.keys(subcollectionCounts).length === 0) {
    console.log('  Nenhuma subcollection encontrada nos primeiros 100 documentos.')
  }
}

main().catch(console.error)
