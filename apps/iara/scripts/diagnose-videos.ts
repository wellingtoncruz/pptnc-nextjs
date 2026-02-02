/**
 * Script to diagnose video data structure
 *
 * Run with: npx tsx scripts/diagnose-videos.ts
 */

import { initializeApp, applicationDefault, getApps, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'pptnc-stage'
const FIRESTORE_DATABASE_ID = 'pptnc-stage'
const PODCAST_ID = 'pptnc'

async function diagnose() {
  if (getApps().length === 0) {
    initializeApp({
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    })
  }

  const db = getFirestore(getApp(), FIRESTORE_DATABASE_ID)

  console.log('=== DIAGNÓSTICO DE VÍDEOS ===\n')

  // 1. Check subcollection path
  const videosRef = db.collection('podcasts').doc(PODCAST_ID).collection('videos')
  const subcollectionSnapshot = await videosRef.limit(5).get()

  console.log(`📂 Path: podcasts/${PODCAST_ID}/videos/`)
  console.log(`📊 Total documentos: ${(await videosRef.count().get()).data().count}`)
  console.log('')

  if (subcollectionSnapshot.empty) {
    console.log('❌ Subcollection vazia!')
  } else {
    console.log('📋 Amostra de documentos (primeiros 5):')
    console.log('')

    for (const doc of subcollectionSnapshot.docs) {
      const data = doc.data()
      console.log(`--- Documento: ${doc.id} ---`)
      console.log(`  Campos presentes: ${Object.keys(data).join(', ')}`)
      console.log(`  status: ${data.status ?? '❌ AUSENTE'}`)
      console.log(`  deleted: ${data.deleted ?? '❌ AUSENTE'}`)
      console.log(`  createdAt: ${data.createdAt ? '✅ presente' : '❌ AUSENTE'}`)
      console.log(`  podcastId: ${data.podcastId ?? '❌ AUSENTE'}`)
      console.log(`  youtubeData: ${data.youtubeData ? '✅ presente' : '❌ AUSENTE'}`)
      if (data.youtubeData) {
        console.log(`    - title: ${data.youtubeData.title?.substring(0, 40)}...`)
      }
      console.log('')
    }
  }

  // 2. Check if videos have createdAt field (needed for orderBy)
  console.log('=== ANÁLISE DE CAMPOS ===\n')

  const allDocs = await videosRef.get()
  let withCreatedAt = 0
  let withoutCreatedAt = 0
  let withStatus = 0
  let withoutStatus = 0
  const statusCounts: Record<string, number> = {}

  for (const doc of allDocs.docs) {
    const data = doc.data()

    if (data.createdAt) withCreatedAt++
    else withoutCreatedAt++

    if (data.status) {
      withStatus++
      statusCounts[data.status] = (statusCounts[data.status] || 0) + 1
    } else {
      withoutStatus++
    }
  }

  console.log(`createdAt presente: ${withCreatedAt}`)
  console.log(`createdAt AUSENTE: ${withoutCreatedAt}`)
  console.log('')
  console.log(`status presente: ${withStatus}`)
  console.log(`status AUSENTE: ${withoutStatus}`)
  console.log('')
  console.log('Distribuição de status:')
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`)
  }

  // 3. Test the actual query used by getVideosByPodcastAdmin
  console.log('\n=== TESTE DA QUERY ===\n')

  try {
    const queryWithOrderBy = await videosRef.orderBy('createdAt', 'desc').get()
    console.log(`✅ Query com orderBy('createdAt', 'desc'): ${queryWithOrderBy.size} documentos`)
  } catch (error) {
    console.log(`❌ Query com orderBy falhou: ${error}`)
  }

  try {
    const queryWithoutOrder = await videosRef.get()
    console.log(`✅ Query sem orderBy: ${queryWithoutOrder.size} documentos`)
  } catch (error) {
    console.log(`❌ Query sem orderBy falhou: ${error}`)
  }
}

diagnose().catch(console.error)
