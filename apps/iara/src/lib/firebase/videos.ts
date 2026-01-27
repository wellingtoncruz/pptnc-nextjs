/**
 * Video Firestore operations using Client SDK.
 *
 * Use these functions in Client Components for reading video data.
 * For write operations in Route Handlers, use videos-admin.ts instead.
 *
 * CRITICAL: All queries include podcastId (enforcement rule #8).
 *
 * REGRA IMUTÁVEL: O schema de videos NUNCA pode ser incompatível com
 * EpisodeEntity do portal-web (packages/types/src/episode.ts).
 *
 * @see architecture-iara.md#Data Architecture
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'

import { ZodError } from 'zod'

import { VideoSchema, VideoCreateSchema, VideoUpdateSchema } from '@/lib/schemas/video'
import { log } from '@/lib/logger'
import { getBestThumbnailUrl, needsIaraFields } from '@/lib/video-utils'
import type { Video, VideoCreate, VideoUpdate, VideoSummary } from '@/types/video'

import { getDb } from './client'

/**
 * Options for listing videos.
 */
export interface GetVideosByPodcastOptions {
  /** Include soft-deleted videos (default: false) */
  includeDeleted?: boolean
}

/**
 * Gets all videos for a podcast.
 *
 * Returns videos with IAra fields (status, videoType).
 * Documents without these fields are returned with defaults.
 *
 * Queries the subcollection: podcasts/{podcastId}/videos
 * All queries include podcastId (enforcement rule #8).
 *
 * @param podcastId - The podcast document ID
 * @param options - Optional query options
 * @returns Array of video documents
 */
export async function getVideosByPodcast(
  podcastId: string,
  options: GetVideosByPodcastOptions = {}
): Promise<Video[]> {
  const { includeDeleted = false } = options
  const db = getDb()
  const videosRef = collection(db, 'podcasts', podcastId, 'videos')

  try {
    // Fetch all documents (no orderBy to support documents without certain fields)
    const querySnapshot = await getDocs(videosRef)

    if (querySnapshot.empty) {
      log('INFO', 'No videos found for podcast', { podcastId, includeDeleted })
      return []
    }

    const videos: Video[] = []
    let skippedCount = 0

    for (const docSnap of querySnapshot.docs) {
      const rawData = docSnap.data()
      const data = { id: docSnap.id, ...rawData }

      // Filter deleted if needed
      if (!includeDeleted && data.deleted === true) {
        continue
      }

      // Validate with flat schema
      const parsed = VideoSchema.safeParse(data)
      if (parsed.success) {
        videos.push(parsed.data)
      } else {
        skippedCount++
        log('WARN', 'Video validation failed, skipping', {
          podcastId,
          videoId: docSnap.id,
          issues: parsed.error.issues,
        })
      }
    }

    // Sort by publishedAt descending
    videos.sort((a, b) => {
      const aDate = a.publishedAt?.toDate?.() ?? new Date(0)
      const bDate = b.publishedAt?.toDate?.() ?? new Date(0)
      return bDate.getTime() - aDate.getTime()
    })

    log('INFO', 'Videos fetched for podcast', {
      podcastId,
      count: videos.length,
      skipped: skippedCount,
      includeDeleted,
    })
    return videos
  } catch (error) {
    log('ERROR', 'Failed to get videos for podcast', { podcastId, error })
    throw error
  }
}

/**
 * Gets all videos for display (with default values for missing fields).
 *
 * Returns VideoSummary objects suitable for list display.
 * Documents without IAra fields get default values.
 *
 * @param podcastId - The podcast document ID
 * @param options - Optional query options
 * @returns Array of VideoSummary objects
 */
export async function getVideosForDisplay(
  podcastId: string,
  options: GetVideosByPodcastOptions = {}
): Promise<VideoSummary[]> {
  const { includeDeleted = false } = options
  const db = getDb()
  const videosRef = collection(db, 'podcasts', podcastId, 'videos')

  try {
    const querySnapshot = await getDocs(videosRef)

    if (querySnapshot.empty) {
      log('INFO', 'No videos found for podcast', { podcastId, includeDeleted })
      return []
    }

    const videos: VideoSummary[] = []

    for (const docSnap of querySnapshot.docs) {
      const rawData = docSnap.data()

      // Filter deleted if needed
      const isDeleted = rawData.deleted === true
      if (!includeDeleted && isDeleted) {
        continue
      }

      // Create summary with default values for missing fields
      const summary: VideoSummary = {
        id: docSnap.id,
        title: rawData.title ?? 'Sem título',
        thumbnails: rawData.thumbnails,
        duration: rawData.duration ?? 0,
        status: rawData.status ?? 'new',
        videoType: rawData.videoType ?? 'cut',
        deleted: isDeleted,
      }
      videos.push(summary)
    }

    // Sort by publishedAt descending
    videos.sort((a, b) => {
      // Get publishedAt from raw data for sorting
      const queryDocs = querySnapshot.docs
      const aDoc = queryDocs.find((d) => d.id === a.id)
      const bDoc = queryDocs.find((d) => d.id === b.id)
      const aDate = aDoc?.data().publishedAt?.toDate?.() ?? new Date(0)
      const bDate = bDoc?.data().publishedAt?.toDate?.() ?? new Date(0)
      return bDate.getTime() - aDate.getTime()
    })

    log('INFO', 'Videos fetched for display', {
      podcastId,
      count: videos.length,
      withIaraFields: videos.filter((v) => v.status !== 'new').length,
      includeDeleted,
    })
    return videos
  } catch (error) {
    log('ERROR', 'Failed to get videos for display', { podcastId, error })
    throw error
  }
}

/**
 * Gets a single video document by ID.
 *
 * Path: podcasts/{podcastId}/videos/{videoId}
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param videoId - The video document ID (YouTube video ID)
 * @returns The validated video document or null if not found
 * @throws ZodError if document data fails validation
 */
export async function getVideo(
  podcastId: string,
  videoId: string
): Promise<Video | null> {
  const db = getDb()
  const docRef = doc(db, 'podcasts', podcastId, 'videos', videoId)

  try {
    const docSnap = await getDoc(docRef)

    if (!docSnap.exists()) {
      log('INFO', 'Video not found', { podcastId, videoId })
      return null
    }

    const data = { id: docSnap.id, ...docSnap.data() }
    return VideoSchema.parse(data)
  } catch (error) {
    if (error instanceof ZodError) {
      log('ERROR', 'Video data validation failed', { podcastId, videoId, issues: error.issues })
    } else {
      log('ERROR', 'Failed to get video', { podcastId, videoId, error })
    }
    throw error
  }
}

/**
 * Creates a new video document.
 *
 * Validates input with Zod BEFORE persisting (enforcement rule #2).
 * Uses serverTimestamp() for timestamps (client SDK).
 * Document ID is the YouTube videoId (natural key).
 *
 * @param data - Video data to create
 * @throws ZodError if input data fails validation
 */
export async function createVideo(data: VideoCreate): Promise<void> {
  // Validate BEFORE persisting (enforcement rule #2)
  const validated = VideoCreateSchema.parse(data)

  const db = getDb()
  const docRef = doc(db, 'podcasts', validated.podcastId, 'videos', validated.id)

  try {
    await setDoc(docRef, {
      ...validated,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    log('INFO', 'Video created', { podcastId: validated.podcastId, videoId: validated.id })
  } catch (error) {
    log('ERROR', 'Failed to create video', {
      podcastId: validated.podcastId,
      videoId: validated.id,
      error,
    })
    throw error
  }
}

/**
 * Updates a video document with field-level merge.
 *
 * Validates input with Zod BEFORE persisting (enforcement rule #2).
 * Uses updateDoc for field-level updates (enforcement rule #4).
 * Automatically updates `updatedAt` timestamp.
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param videoId - The video document ID
 * @param data - Partial video data to update
 * @throws ZodError if input data fails validation
 */
export async function updateVideo(
  podcastId: string,
  videoId: string,
  data: VideoUpdate
): Promise<void> {
  // Validate BEFORE persisting (enforcement rule #2)
  const validated = VideoUpdateSchema.parse(data)

  const db = getDb()
  const docRef = doc(db, 'podcasts', podcastId, 'videos', videoId)

  try {
    // Use updateDoc, NOT setDoc (enforcement rule #4)
    await updateDoc(docRef, {
      ...validated,
      updatedAt: serverTimestamp(),
    })

    log('INFO', 'Video updated', { podcastId, videoId, fields: Object.keys(validated) })
  } catch (error) {
    log('ERROR', 'Failed to update video', { podcastId, videoId, error })
    throw error
  }
}

/**
 * Soft deletes a video by setting deleted flag to true.
 *
 * Does NOT physically delete the document (soft delete pattern).
 * Uses updateDoc for field-level updates (enforcement rule #4).
 *
 * @param podcastId - The podcast document ID (enforcement rule #8)
 * @param videoId - The video document ID
 */
export async function softDeleteVideo(
  podcastId: string,
  videoId: string
): Promise<void> {
  const db = getDb()
  const docRef = doc(db, 'podcasts', podcastId, 'videos', videoId)

  try {
    await updateDoc(docRef, {
      deleted: true,
      updatedAt: serverTimestamp(),
    })

    log('INFO', 'Video soft deleted', { podcastId, videoId })
  } catch (error) {
    log('ERROR', 'Failed to soft delete video', { podcastId, videoId, error })
    throw error
  }
}
