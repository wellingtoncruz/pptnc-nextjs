/**
 * Check all videos without any filter
 */

import { initializeApp, applicationDefault, getApps, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

async function main() {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId: 'pptnc-stage' })
  }

  const db = getFirestore(getApp(), 'pptnc-stage')
  const videosRef = db.collection('podcasts').doc('pptnc').collection('videos')

  // Query sem filtro algum
  const snapshot = await videosRef.get()

  console.log('Total documentos (sem filtro):', snapshot.size)
  console.log('')

  // Analisar schemas
  let legacyCount = 0
  let newSchemaCount = 0
  const sampleLegacy: string[] = []
  const sampleNew: string[] = []

  for (const doc of snapshot.docs) {
    const data = doc.data()
    if (data.youtubeData) {
      newSchemaCount++
      if (sampleNew.length < 3) {
        sampleNew.push(`${doc.id}: ${data.youtubeData.title?.substring(0, 40)}...`)
      }
    } else {
      legacyCount++
      if (sampleLegacy.length < 3) {
        sampleLegacy.push(`${doc.id}: ${data.title?.substring(0, 40)}...`)
      }
    }
  }

  console.log('Schema novo (com youtubeData):', newSchemaCount)
  if (sampleNew.length > 0) {
    console.log('  Exemplos:')
    sampleNew.forEach(s => console.log(`    - ${s}`))
  }

  console.log('')
  console.log('Schema legado (sem youtubeData):', legacyCount)
  if (sampleLegacy.length > 0) {
    console.log('  Exemplos:')
    sampleLegacy.forEach(s => console.log(`    - ${s}`))
  }
}

main().catch(console.error)
