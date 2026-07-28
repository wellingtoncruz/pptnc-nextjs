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
  uploadNewsImage,
  downloadNewsImage,
  deleteNewsImage,
  uploadThumbnailConfigImage,
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

// ==========================================================================
// Story 18.8 — News image Cloud Storage helpers
// ==========================================================================

describe('uploadNewsImage (Story 18.8)', () => {
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

  it('saves image with correct news-images path pattern', async () => {
    await uploadNewsImage('news-1', Buffer.from('test-image'))

    expect(mockFile).toHaveBeenCalledWith(
      expect.stringMatching(/^news-images\/pptnc\/news-1\/\d+\.png$/)
    )
  })

  it('returns GCS file path (not a URL)', async () => {
    const result = await uploadNewsImage('news-1', Buffer.from('test-image'))

    expect(result).toMatch(/^news-images\/pptnc\/news-1\/\d+\.png$/)
    expect(result).not.toContain('https://')
  })

  it('sets content-type to image/png', async () => {
    await uploadNewsImage('news-1', Buffer.from('test-image'))

    expect(mockSave).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/png', resumable: false })
    )
  })

  it('throws CloudStorageError with UPLOAD_FAILED when save fails', async () => {
    mockSave.mockRejectedValue(new Error('Network error'))

    const error = await uploadNewsImage('news-1', Buffer.from('test')).catch((e) => e)

    expect(error).toBeInstanceOf(CloudStorageError)
    expect(error.code).toBe('UPLOAD_FAILED')
  })

  it('rejects invalid newsId characters', async () => {
    const error = await uploadNewsImage('../etc/passwd', Buffer.from('test')).catch((e) => e)

    expect(error).toBeInstanceOf(CloudStorageError)
    expect(error.code).toBe('UPLOAD_FAILED')
  })
})

describe('downloadNewsImage (Story 18.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDownload.mockResolvedValue([Buffer.from('news-image-data')])
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
    const result = await downloadNewsImage('news-images/pptnc/news-1/123.png')

    expect(mockFile).toHaveBeenCalledWith('news-images/pptnc/news-1/123.png')
    expect(result).toEqual(Buffer.from('news-image-data'))
  })

  it('throws CloudStorageError with DOWNLOAD_FAILED on error', async () => {
    mockDownload.mockRejectedValue(new Error('Not found'))

    const error = await downloadNewsImage('news-images/pptnc/news-1/123.png').catch((e) => e)

    expect(error).toBeInstanceOf(CloudStorageError)
    expect(error.code).toBe('DOWNLOAD_FAILED')
  })

  it('rejects invalid file path prefix', async () => {
    const error = await downloadNewsImage('newsletters/pptnc/video-1/123.png').catch((e) => e)

    expect(error).toBeInstanceOf(CloudStorageError)
    expect(error.code).toBe('DOWNLOAD_FAILED')
  })

  it('rejects path traversal with ../', async () => {
    const error = await downloadNewsImage('news-images/../etc/passwd').catch((e) => e)

    expect(error).toBeInstanceOf(CloudStorageError)
    expect(error.code).toBe('DOWNLOAD_FAILED')
  })
})

describe('deleteNewsImage (Story 18.8)', () => {
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

  it('deletes file by path', async () => {
    await deleteNewsImage('news-images/pptnc/news-1/123.png')

    expect(mockFile).toHaveBeenCalledWith('news-images/pptnc/news-1/123.png')
    expect(mockDelete).toHaveBeenCalledWith({ ignoreNotFound: true })
  })

  it('does NOT throw when delete fails (fire-and-forget)', async () => {
    mockDelete.mockRejectedValue(new Error('Permission denied'))

    await expect(
      deleteNewsImage('news-images/pptnc/news-1/123.png')
    ).resolves.toBeUndefined()
  })

  it('logs warning when delete fails', async () => {
    const { log } = await import('@/lib/logger')
    mockDelete.mockRejectedValue(new Error('Permission denied'))

    await deleteNewsImage('news-images/pptnc/news-1/123.png')

    expect(log).toHaveBeenCalledWith(
      'WARN',
      'News image delete failed (fire-and-forget)',
      expect.objectContaining({
        error: 'Permission denied',
      })
    )
  })

  it('rejects invalid file path prefix silently', async () => {
    await deleteNewsImage('newsletters/pptnc/video-1/123.png')

    expect(mockFile).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('rejects path traversal with ../ silently', async () => {
    await deleteNewsImage('news-images/../etc/passwd')

    expect(mockFile).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Epic 28 — segmento `kind` no path da config (imagens extras do episódio)
// ============================================================================

describe('uploadThumbnailConfigImage — kind (Epic 28)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSave.mockResolvedValue(undefined)
  })

  /**
   * Sem `kind` o path tem que ser byte-a-byte o do Epic 22 — configs de
   * thumbnail já gravadas em produção continuam legíveis.
   */
  it('mantém o path do thumbnail quando kind é omitido', async () => {
    const { filePath } = await uploadThumbnailConfigImage(
      'episode',
      'base',
      Buffer.from('img'),
      'image/png'
    )
    expect(filePath).toMatch(/^thumbnail-config\/pptnc\/episode\/base-\d+\.png$/)
  })

  it('insere o kind como segmento extra quando informado', async () => {
    const { filePath } = await uploadThumbnailConfigImage(
      'episode',
      'reference',
      Buffer.from('img'),
      'image/jpeg',
      'vitrine'
    )
    expect(filePath).toMatch(/^thumbnail-config\/pptnc\/episode\/vitrine\/reference-\d+\.jpg$/)
  })

  it('isola os três kinds em paths distintos', async () => {
    const paths: string[] = []
    for (const kind of ['story', 'vitrine', 'feed'] as const) {
      const { filePath } = await uploadThumbnailConfigImage(
        'episode',
        'base',
        Buffer.from('img'),
        'image/png',
        kind
      )
      paths.push(filePath.replace(/-\d+\.png$/, ''))
    }
    expect(new Set(paths).size).toBe(3)
  })

  /**
   * Continua sob `thumbnail-config/` de propósito: é o prefixo que o proxy GET
   * valida, então as imagens extras são servidas sem rota nem validação nova.
   */
  it('mantém o prefixo thumbnail-config/ (o proxy GET valida por ele)', async () => {
    const { filePath } = await uploadThumbnailConfigImage(
      'episode',
      'base',
      Buffer.from('img'),
      'image/png',
      'feed'
    )
    expect(filePath.startsWith('thumbnail-config/')).toBe(true)
  })

  it('rejeita kind desconhecido', async () => {
    await expect(
      uploadThumbnailConfigImage(
        'episode',
        'base',
        Buffer.from('img'),
        'image/png',
        'carrossel' as 'story'
      )
    ).rejects.toBeInstanceOf(CloudStorageError)
  })

  it('rejeita kind combinado com videoType que não é episode', async () => {
    await expect(
      uploadThumbnailConfigImage('cut', 'base', Buffer.from('img'), 'image/png', 'story')
    ).rejects.toThrow(/only for episodes/)
  })
})
