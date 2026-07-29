/**
 * Tests da rota pública de imagens do Relatório Editorial.
 *
 * O ponto central: a rota NÃO tem auth, então o que a mantém fechada é o path
 * vir do documento do vídeo. Vários testes abaixo existem só para garantir que
 * um `path` no querystring continue sendo ignorado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDownloadThumbFinal = vi.fn()
const mockDownloadExtraFinal = vi.fn()
vi.mock('@/lib/firebase/cloud-storage', () => ({
  downloadThumbnailFinalImage: (...a: unknown[]) => mockDownloadThumbFinal(...a),
  downloadExtraImageFinal: (...a: unknown[]) => mockDownloadExtraFinal(...a),
  CloudStorageError: class CloudStorageError extends Error {
    code: string
    constructor(message: string, code: string) {
      super(message)
      this.name = 'CloudStorageError'
      this.code = code
    }
  },
}))

const mockGetVideo = vi.fn()
vi.mock('@/lib/firebase/videos-admin', () => ({
  getVideoAdmin: (...a: unknown[]) => mockGetVideo(...a),
}))

vi.mock('@/lib/firebase/config', () => ({ PODCAST_ID: 'pptnc' }))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { CloudStorageError } from '@/lib/firebase/cloud-storage'
import { GET } from './route'

const THUMB_PATH = 'thumbnails/pptnc/vid1/final-1.png'
const STORY_PATH = 'extra-images/pptnc/vid1/story-2.jpg'
const THUMB_URL = `/api/wizard/thumbnail/select?path=${encodeURIComponent(THUMB_PATH)}`
const STORY_URL = `/api/wizard/extra-images/select?path=${encodeURIComponent(STORY_PATH)}`

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])

function request(videoId: string, query: string): [Request, { params: Promise<{ videoId: string }> }] {
  return [
    new Request(`http://localhost/api/report/${videoId}/image${query}`),
    { params: Promise.resolve({ videoId }) },
  ]
}

describe('GET /api/report/[videoId]/image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetVideo.mockResolvedValue({
      id: 'vid1',
      videoType: 'episode',
      storageThumbnailUrl: THUMB_URL,
      extraImages: { story: STORY_URL },
    })
    mockDownloadThumbFinal.mockResolvedValue(PNG_BYTES)
    mockDownloadExtraFinal.mockResolvedValue(JPEG_BYTES)
  })

  it('serve a thumbnail sem exigir sessão', async () => {
    const response = await GET(...request('vid1', '?kind=thumbnail'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(mockDownloadThumbFinal).toHaveBeenCalledWith(THUMB_PATH)
  })

  it('serve uma imagem extra pelo kind', async () => {
    const response = await GET(...request('vid1', '?kind=story'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(mockDownloadExtraFinal).toHaveBeenCalledWith(STORY_PATH)
  })

  it('resolve o path pelo documento e ignora o path do querystring', async () => {
    const evil = encodeURIComponent('thumbnails/pptnc/outro-video/final-9.png')
    await GET(...request('vid1', `?kind=thumbnail&path=${evil}`))

    expect(mockDownloadThumbFinal).toHaveBeenCalledWith(THUMB_PATH)
    expect(mockDownloadThumbFinal).not.toHaveBeenCalledWith(expect.stringContaining('outro-video'))
  })

  it('anexa Content-Disposition com a extensão do arquivo quando download=1', async () => {
    const response = await GET(...request('vid1', '?kind=story&download=1'))

    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="vid1-story.jpg"'
    )
  })

  it('não anexa Content-Disposition sem download=1', async () => {
    const response = await GET(...request('vid1', '?kind=thumbnail'))

    expect(response.headers.get('Content-Disposition')).toBeNull()
  })

  it('usa cache curto e público', async () => {
    const response = await GET(...request('vid1', '?kind=thumbnail'))

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60')
  })

  it('400 para kind desconhecido', async () => {
    const response = await GET(...request('vid1', '?kind=guest'))

    expect(response.status).toBe(400)
    expect(mockGetVideo).not.toHaveBeenCalled()
  })

  it('400 quando kind está ausente', async () => {
    const response = await GET(...request('vid1', ''))

    expect(response.status).toBe(400)
  })

  it('400 para videoId fora do pattern seguro', async () => {
    const response = await GET(...request('..%2Fsecret', '?kind=thumbnail'))

    expect(response.status).toBe(400)
    expect(mockGetVideo).not.toHaveBeenCalled()
  })

  it('404 quando o vídeo não existe', async () => {
    mockGetVideo.mockResolvedValue(null)

    const response = await GET(...request('vid1', '?kind=thumbnail'))

    expect(response.status).toBe(404)
  })

  it('404 quando o vídeo não é episódio', async () => {
    mockGetVideo.mockResolvedValue({ id: 'vid1', videoType: 'cut', storageThumbnailUrl: THUMB_URL })

    const response = await GET(...request('vid1', '?kind=thumbnail'))

    expect(response.status).toBe(404)
    expect(mockDownloadThumbFinal).not.toHaveBeenCalled()
  })

  it('404 quando o episódio não tem aquela imagem', async () => {
    const response = await GET(...request('vid1', '?kind=feed'))

    expect(response.status).toBe(404)
    expect(mockDownloadExtraFinal).not.toHaveBeenCalled()
  })

  it('404 quando a URL persistida não é de um proxy final', async () => {
    mockGetVideo.mockResolvedValue({
      id: 'vid1',
      videoType: 'episode',
      storageThumbnailUrl: 'https://i.ytimg.com/vi/vid1/maxres.jpg',
    })

    const response = await GET(...request('vid1', '?kind=thumbnail'))

    expect(response.status).toBe(404)
    expect(mockDownloadThumbFinal).not.toHaveBeenCalled()
  })

  it('404 quando o arquivo sumiu do bucket', async () => {
    mockDownloadThumbFinal.mockRejectedValue(new CloudStorageError('gone', 'DOWNLOAD_FAILED'))

    const response = await GET(...request('vid1', '?kind=thumbnail'))

    expect(response.status).toBe(404)
  })

  it('404 quando a leitura do vídeo falha', async () => {
    mockGetVideo.mockRejectedValue(new Error('firestore down'))

    const response = await GET(...request('vid1', '?kind=thumbnail'))

    expect(response.status).toBe(404)
  })

  it('500 em erro inesperado no download', async () => {
    mockDownloadThumbFinal.mockRejectedValue(new Error('boom'))

    const response = await GET(...request('vid1', '?kind=thumbnail'))

    expect(response.status).toBe(500)
  })
})
