import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSave = vi.fn().mockResolvedValue(undefined)
const mockDownload = vi.fn().mockResolvedValue([Buffer.from('image-data')])
const mockDelete = vi.fn().mockResolvedValue(undefined)
const mockFile = vi.fn().mockReturnValue({
  save: mockSave,
  download: mockDownload,
  delete: mockDelete,
})
const mockBucket = vi.fn().mockReturnValue({
  name: 'test-bucket',
  file: mockFile,
})

vi.mock('./admin', () => ({
  getAdminStorage: vi.fn(() => ({
    bucket: mockBucket,
  })),
}))

vi.mock('./config', () => ({
  PODCAST_ID: 'pptnc',
  NEWSLETTER_IMAGES_BUCKET: '',
}))

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import {
  uploadNewsletterImage,
  downloadNewsletterImage,
  deleteNewsletterImage,
  CloudStorageError,
} from './cloud-storage'

describe('uploadNewsletterImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSave.mockResolvedValue(undefined)
    mockFile.mockReturnValue({
      save: mockSave,
      download: mockDownload,
      delete: mockDelete,
    })
    mockBucket.mockReturnValue({
      name: 'test-bucket',
      file: mockFile,
    })
  })

  it('saves image with correct path pattern', async () => {
    await uploadNewsletterImage('video-1', Buffer.from('test-image'))

    expect(mockFile).toHaveBeenCalledWith(
      expect.stringMatching(/^newsletters\/pptnc\/video-1\/\d+\.png$/)
    )
  })

  it('sets content-type to image/png', async () => {
    await uploadNewsletterImage('video-1', Buffer.from('test-image'))

    expect(mockSave).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/png', resumable: false })
    )
  })

  it('returns GCS file path (not a URL)', async () => {
    const result = await uploadNewsletterImage('video-1', Buffer.from('test-image'))

    expect(result).toMatch(/^newsletters\/pptnc\/video-1\/\d+\.png$/)
    expect(result).not.toContain('https://')
  })

  it('uses default bucket when NEWSLETTER_IMAGES_BUCKET is empty', async () => {
    await uploadNewsletterImage('video-1', Buffer.from('test-image'))

    expect(mockBucket).toHaveBeenCalledWith()
  })

  it('passes bucket name when NEWSLETTER_IMAGES_BUCKET is set', async () => {
    const config = await import('./config')
    const original = config.NEWSLETTER_IMAGES_BUCKET
    Object.defineProperty(config, 'NEWSLETTER_IMAGES_BUCKET', { value: 'custom-bucket', writable: true })

    await uploadNewsletterImage('video-1', Buffer.from('test-image'))

    expect(mockBucket).toHaveBeenCalledWith('custom-bucket')

    Object.defineProperty(config, 'NEWSLETTER_IMAGES_BUCKET', { value: original, writable: true })
  })

  it('logs success with correct metadata', async () => {
    const { log } = await import('@/lib/logger')

    await uploadNewsletterImage('video-1', Buffer.from('test-image'))

    expect(log).toHaveBeenCalledWith(
      'INFO',
      'Newsletter image uploaded',
      expect.objectContaining({
        podcastId: 'pptnc',
        videoId: 'video-1',
        filePath: expect.stringMatching(/^newsletters\/pptnc\/video-1\/\d+\.png$/),
        size: 10,
      })
    )
  })

  it('throws CloudStorageError with UPLOAD_FAILED when save fails', async () => {
    mockSave.mockRejectedValue(new Error('Network error'))

    const error = await uploadNewsletterImage('video-1', Buffer.from('test')).catch((e) => e)

    expect(error).toBeInstanceOf(CloudStorageError)
    expect(error.code).toBe('UPLOAD_FAILED')
  })

  it('logs error when upload fails', async () => {
    const { log } = await import('@/lib/logger')
    mockSave.mockRejectedValue(new Error('Network error'))

    await uploadNewsletterImage('video-1', Buffer.from('test')).catch(() => {})

    expect(log).toHaveBeenCalledWith(
      'ERROR',
      'Newsletter image upload failed',
      expect.objectContaining({
        videoId: 'video-1',
        error: 'Network error',
      })
    )
  })
})

describe('downloadNewsletterImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDownload.mockResolvedValue([Buffer.from('image-data')])
    mockFile.mockReturnValue({
      save: mockSave,
      download: mockDownload,
      delete: mockDelete,
    })
    mockBucket.mockReturnValue({
      name: 'test-bucket',
      file: mockFile,
    })
  })

  it('downloads file by path and returns buffer', async () => {
    const result = await downloadNewsletterImage('newsletters/pptnc/video-1/123.png')

    expect(mockFile).toHaveBeenCalledWith('newsletters/pptnc/video-1/123.png')
    expect(mockDownload).toHaveBeenCalledTimes(1)
    expect(result).toEqual(Buffer.from('image-data'))
  })

  it('throws CloudStorageError with DOWNLOAD_FAILED on error', async () => {
    mockDownload.mockRejectedValue(new Error('Not found'))

    const error = await downloadNewsletterImage('path/to/file.png').catch((e) => e)

    expect(error).toBeInstanceOf(CloudStorageError)
    expect(error.code).toBe('DOWNLOAD_FAILED')
  })

  it('logs success', async () => {
    const { log } = await import('@/lib/logger')

    await downloadNewsletterImage('newsletters/pptnc/video-1/123.png')

    expect(log).toHaveBeenCalledWith(
      'INFO',
      'Newsletter image downloaded',
      expect.objectContaining({ filePath: 'newsletters/pptnc/video-1/123.png' })
    )
  })
})

describe('deleteNewsletterImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockResolvedValue(undefined)
    mockFile.mockReturnValue({
      save: mockSave,
      download: mockDownload,
      delete: mockDelete,
    })
    mockBucket.mockReturnValue({
      name: 'test-bucket',
      file: mockFile,
    })
  })

  it('deletes file by path directly', async () => {
    await deleteNewsletterImage('newsletters/pptnc/video-1/1234567890.png')

    expect(mockFile).toHaveBeenCalledWith('newsletters/pptnc/video-1/1234567890.png')
    expect(mockDelete).toHaveBeenCalledWith({ ignoreNotFound: true })
  })

  it('logs success on delete', async () => {
    const { log } = await import('@/lib/logger')

    await deleteNewsletterImage('newsletters/pptnc/video-1/1234567890.png')

    expect(log).toHaveBeenCalledWith(
      'INFO',
      'Newsletter image deleted',
      expect.objectContaining({
        podcastId: 'pptnc',
        filePath: 'newsletters/pptnc/video-1/1234567890.png',
      })
    )
  })

  it('does NOT throw when delete fails (fire-and-forget)', async () => {
    mockDelete.mockRejectedValue(new Error('Permission denied'))

    await expect(
      deleteNewsletterImage('newsletters/pptnc/video-1/1234567890.png')
    ).resolves.toBeUndefined()
  })

  it('logs warning when delete fails', async () => {
    const { log } = await import('@/lib/logger')
    mockDelete.mockRejectedValue(new Error('Permission denied'))

    await deleteNewsletterImage('newsletters/pptnc/video-1/1234567890.png')

    expect(log).toHaveBeenCalledWith(
      'WARN',
      'Newsletter image delete failed (fire-and-forget)',
      expect.objectContaining({
        error: 'Permission denied',
      })
    )
  })
})
