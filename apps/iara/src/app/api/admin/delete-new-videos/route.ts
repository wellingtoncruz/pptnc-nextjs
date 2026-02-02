/**
 * TEMPORARY ADMIN ROUTE - Delete videos with status "new"
 *
 * Access: http://localhost:3000/api/admin/delete-new-videos
 *
 * DELETE THIS FILE AFTER USE
 */

import { NextResponse } from 'next/server'

import { getAdminDb } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  console.log('=== DELETE NEW VIDEOS ROUTE CALLED ===')

  try {
    const db = getAdminDb()

    console.log('Getting podcasts...')

    // Get all podcasts
    const podcastsSnapshot = await db.collection('podcasts').get()
    console.log(`Found ${podcastsSnapshot.size} podcasts`)

    const results: { podcastId: string; deleted: number; videos: string[] }[] = []
    let totalDeleted = 0

    for (const podcastDoc of podcastsSnapshot.docs) {
      const podcastId = podcastDoc.id
      console.log(`Processing podcast: ${podcastId}`)

      // Query videos with status = "new"
      const videosSnapshot = await db
        .collection('podcasts')
        .doc(podcastId)
        .collection('videos')
        .where('status', '==', 'new')
        .get()

      if (videosSnapshot.empty) {
        console.log(`  No videos with status "new"`)
        continue
      }

      console.log(`  Found ${videosSnapshot.size} videos with status "new"`)

      // Delete in batch
      const batch = db.batch()
      const deletedVideos: string[] = []

      for (const videoDoc of videosSnapshot.docs) {
        batch.delete(videoDoc.ref)
        deletedVideos.push(videoDoc.id)
        console.log(`  - Deleting: ${videoDoc.id}`)
      }

      await batch.commit()

      results.push({
        podcastId,
        deleted: deletedVideos.length,
        videos: deletedVideos,
      })

      totalDeleted += deletedVideos.length
    }

    console.log(`=== TOTAL DELETED: ${totalDeleted} ===`)

    return NextResponse.json({
      success: true,
      totalDeleted,
      results,
    })
  } catch (error) {
    console.error('Error deleting videos:', error)
    return NextResponse.json(
      { error: 'Failed to delete videos', details: String(error) },
      { status: 500 }
    )
  }
}

export async function POST() {
  return GET()
}
