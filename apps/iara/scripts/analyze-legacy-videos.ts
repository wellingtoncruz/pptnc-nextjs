/**
 * Analyze legacy videos collection structure from pptnc database
 *
 * This script reads from:
 * - Source: database 'pptnc' / collection 'videos'
 * - Target: database 'pptnc-stage' / collection 'podcasts/pptnc/videos'
 */

import { initializeApp, applicationDefault, getApps, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'pptnc-stage'

async function analyzeSourceDatabase() {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID })
  }

  const app = getApp()

  // Source database: pptnc (production/legacy)
  const sourceDb = getFirestore(app, 'pptnc')

  // Target database: pptnc-stage
  const targetDb = getFirestore(app, 'pptnc-stage')

  console.log('='.repeat(60))
  console.log('ANÁLISE DA BASE DE DADOS FONTE (pptnc)')
  console.log('='.repeat(60))
  console.log('')

  // 1. Count documents in source
  const sourceVideosRef = sourceDb.collection('videos')
  const sourceSnapshot = await sourceVideosRef.get()

  console.log(`📊 Total de vídeos na collection 'videos' (db: pptnc): ${sourceSnapshot.size}`)
  console.log('')

  // 2. Analyze schema of source documents
  console.log('📋 ANÁLISE DE SCHEMA (amostra de 5 documentos):')
  console.log('')

  const fieldCounts: Record<string, number> = {}
  const subcollectionCounts: Record<string, number> = {}
  let docsWithSubcollections = 0

  for (const doc of sourceSnapshot.docs.slice(0, 5)) {
    const data = doc.data()
    console.log(`--- Documento: ${doc.id} ---`)
    console.log(`  Campos: ${Object.keys(data).join(', ')}`)

    // Check for subcollections
    const subcollections = await doc.ref.listCollections()
    if (subcollections.length > 0) {
      console.log(`  Subcollections: ${subcollections.map(s => s.id).join(', ')}`)
    }
    console.log('')
  }

  // 3. Full field analysis
  console.log('📊 ANÁLISE COMPLETA DE CAMPOS:')
  console.log('')

  for (const doc of sourceSnapshot.docs) {
    const data = doc.data()
    for (const field of Object.keys(data)) {
      fieldCounts[field] = (fieldCounts[field] || 0) + 1
    }

    // Check subcollections for each document
    const subcollections = await doc.ref.listCollections()
    if (subcollections.length > 0) {
      docsWithSubcollections++
      for (const subcol of subcollections) {
        subcollectionCounts[subcol.id] = (subcollectionCounts[subcol.id] || 0) + 1
      }
    }
  }

  console.log('Campos encontrados (campo: quantidade de docs):')
  const sortedFields = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])
  for (const [field, count] of sortedFields) {
    const percentage = ((count / sourceSnapshot.size) * 100).toFixed(1)
    console.log(`  ${field}: ${count} (${percentage}%)`)
  }

  console.log('')
  console.log(`📁 Documentos com subcollections: ${docsWithSubcollections}`)
  if (Object.keys(subcollectionCounts).length > 0) {
    console.log('Subcollections encontradas:')
    for (const [name, count] of Object.entries(subcollectionCounts)) {
      console.log(`  ${name}: ${count} documentos`)
    }
  }

  // 4. Analyze data types and sample values
  console.log('')
  console.log('📝 TIPOS DE DADOS E VALORES DE EXEMPLO:')
  console.log('')

  const sampleDoc = sourceSnapshot.docs[0]
  if (sampleDoc) {
    const data = sampleDoc.data()
    for (const [field, value] of Object.entries(data)) {
      const type = typeof value
      let displayValue = ''

      if (value === null) {
        displayValue = 'null'
      } else if (type === 'object') {
        if (value.toDate) {
          displayValue = `Timestamp(${value.toDate().toISOString()})`
        } else if (Array.isArray(value)) {
          displayValue = `Array[${value.length}]`
        } else {
          displayValue = `Object{${Object.keys(value).join(', ')}}`
        }
      } else if (type === 'string') {
        displayValue = `"${String(value).substring(0, 50)}${String(value).length > 50 ? '...' : ''}"`
      } else {
        displayValue = String(value)
      }

      console.log(`  ${field}: ${type} = ${displayValue}`)
    }
  }

  // 5. Check subcollection content (sample)
  if (docsWithSubcollections > 0) {
    console.log('')
    console.log('📁 CONTEÚDO DE SUBCOLLECTIONS (amostra):')
    console.log('')

    for (const doc of sourceSnapshot.docs.slice(0, 3)) {
      const subcollections = await doc.ref.listCollections()
      for (const subcol of subcollections) {
        const subDocs = await subcol.limit(2).get()
        console.log(`Video ${doc.id} / ${subcol.id}:`)
        for (const subDoc of subDocs.docs) {
          const subData = subDoc.data()
          console.log(`  - ${subDoc.id}: ${Object.keys(subData).join(', ')}`)
        }
      }
    }
  }

  // 6. Check target database current state
  console.log('')
  console.log('='.repeat(60))
  console.log('ESTADO ATUAL DA BASE DE DADOS DESTINO (pptnc-stage)')
  console.log('='.repeat(60))
  console.log('')

  const targetVideosRef = targetDb.collection('podcasts').doc('pptnc').collection('videos')
  const targetCount = (await targetVideosRef.count().get()).data().count
  console.log(`📊 Videos em podcasts/pptnc/videos: ${targetCount}`)

  // Summary
  console.log('')
  console.log('='.repeat(60))
  console.log('RESUMO DA MIGRAÇÃO')
  console.log('='.repeat(60))
  console.log('')
  console.log(`Fonte: pptnc/videos (${sourceSnapshot.size} documentos)`)
  console.log(`Destino: pptnc-stage/podcasts/pptnc/videos (${targetCount} documentos atuais)`)
  console.log(`Documentos com subcollections: ${docsWithSubcollections}`)
  console.log(`Subcollections únicas: ${Object.keys(subcollectionCounts).join(', ') || 'nenhuma'}`)
}

analyzeSourceDatabase().catch(console.error)
