/**
 * Script para descobrir TODAS as subcollections em /videos na produção.
 * Varre todos os documentos, não apenas uma amostra.
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

  console.log('Buscando TODOS os documentos em /videos...')
  const videosRef = db.collection('videos')
  const snapshot = await videosRef.get()

  console.log(`Total: ${snapshot.size} documentos\n`)
  console.log('Verificando subcollections em cada documento...\n')

  const subcollectionCounts: Record<string, number> = {}

  for (let i = 0; i < snapshot.docs.length; i++) {
    const doc = snapshot.docs[i]
    const subcollections = await doc.ref.listCollections()

    for (const subcol of subcollections) {
      subcollectionCounts[subcol.id] = (subcollectionCounts[subcol.id] || 0) + 1
    }

    if ((i + 1) % 500 === 0) {
      console.log(`Progresso: ${i + 1}/${snapshot.size}`)
    }
  }

  console.log('\n' + '='.repeat(40))
  console.log('SUBCOLLECTIONS ENCONTRADAS:')
  console.log('='.repeat(40))

  if (Object.keys(subcollectionCounts).length === 0) {
    console.log('Nenhuma subcollection encontrada.')
  } else {
    for (const [name, count] of Object.entries(subcollectionCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${name}: ${count} documentos`)
    }
  }
}

main().catch(console.error)
