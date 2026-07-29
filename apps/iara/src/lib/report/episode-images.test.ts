/**
 * Tests do resolvedor de imagens do Relatório Editorial.
 */
import { describe, expect, it } from 'vitest'

import {
  extractStoredImagePath,
  fileExtensionFromPath,
  getReportImages,
  getStoredImageUrl,
  isReportImageKind,
  REPORT_IMAGE_KINDS,
} from './episode-images'
import type { Video } from '@/types/video'

const thumbUrl = `/api/wizard/thumbnail/select?path=${encodeURIComponent('thumbnails/pptnc/vid1/final-1.png')}`
const storyUrl = `/api/wizard/extra-images/select?path=${encodeURIComponent('extra-images/pptnc/vid1/story-2.jpg')}`

function video(overrides: Partial<Video> = {}): Video {
  return { id: 'vid1', videoType: 'episode', ...overrides } as Video
}

describe('REPORT_IMAGE_KINDS', () => {
  it('coloca a thumbnail antes das extras', () => {
    expect([...REPORT_IMAGE_KINDS]).toEqual(['thumbnail', 'story', 'vitrine', 'feed'])
  })

  it('isReportImageKind aceita só os kinds conhecidos', () => {
    expect(isReportImageKind('thumbnail')).toBe(true)
    expect(isReportImageKind('feed')).toBe(true)
    expect(isReportImageKind('guest')).toBe(false)
    expect(isReportImageKind('')).toBe(false)
  })
})

describe('extractStoredImagePath', () => {
  it('extrai o path dos dois proxies finais', () => {
    expect(extractStoredImagePath(thumbUrl)).toBe('thumbnails/pptnc/vid1/final-1.png')
    expect(extractStoredImagePath(storyUrl)).toBe('extra-images/pptnc/vid1/story-2.jpg')
  })

  it('rejeita URL vazia, ausente ou de outra origem', () => {
    expect(extractStoredImagePath(undefined)).toBeNull()
    expect(extractStoredImagePath('')).toBeNull()
    expect(extractStoredImagePath('https://i.ytimg.com/vi/vid1/maxres.jpg')).toBeNull()
  })

  it('rejeita o proxy de staging — só o final vai para o relatório público', () => {
    const staging = `/api/wizard/thumbnail/upload?path=${encodeURIComponent('thumbnail-staging/pptnc/vid1/gen-1.png')}`
    expect(extractStoredImagePath(staging)).toBeNull()
  })

  it('rejeita path traversal mesmo vindo do documento', () => {
    const evil = `/api/wizard/thumbnail/select?path=${encodeURIComponent('thumbnails/pptnc/../../secrets.png')}`
    expect(extractStoredImagePath(evil)).toBeNull()
  })
})

describe('getStoredImageUrl', () => {
  it('lê storageThumbnailUrl para thumbnail e extraImages para o resto', () => {
    const v = video({ storageThumbnailUrl: thumbUrl, extraImages: { story: storyUrl } })
    expect(getStoredImageUrl(v, 'thumbnail')).toBe(thumbUrl)
    expect(getStoredImageUrl(v, 'story')).toBe(storyUrl)
    expect(getStoredImageUrl(v, 'feed')).toBeUndefined()
  })
})

describe('getReportImages', () => {
  it('retorna vazio quando o episódio não tem nenhuma imagem', () => {
    expect(getReportImages(video())).toEqual([])
  })

  it('inclui apenas as imagens com path resolvível, na ordem canônica', () => {
    const v = video({
      storageThumbnailUrl: thumbUrl,
      extraImages: { feed: storyUrl, story: storyUrl },
    })
    expect(getReportImages(v).map((i) => i.kind)).toEqual(['thumbnail', 'story', 'feed'])
  })

  it('omite uma thumbnail em formato antigo em vez de renderizar card quebrado', () => {
    const v = video({ storageThumbnailUrl: 'https://i.ytimg.com/vi/vid1/maxres.jpg' })
    expect(getReportImages(v)).toEqual([])
  })

  it('aponta src e download para a rota pública do relatório', () => {
    const [image] = getReportImages(video({ storageThumbnailUrl: thumbUrl }))
    expect(image.src).toBe('/api/report/vid1/image?kind=thumbnail')
    expect(image.downloadHref).toBe('/api/report/vid1/image?kind=thumbnail&download=1')
    expect(image.label).toBe('Thumbnail')
  })

  it('escapa o videoId na URL', () => {
    const v = video({ id: 'a b', storageThumbnailUrl: thumbUrl })
    expect(getReportImages(v)[0].src).toBe('/api/report/a%20b/image?kind=thumbnail')
  })
})

describe('fileExtensionFromPath', () => {
  it('usa a extensão do arquivo', () => {
    expect(fileExtensionFromPath('extra-images/pptnc/v/story-1.jpg')).toBe('jpg')
    expect(fileExtensionFromPath('extra-images/pptnc/v/story-1.webp')).toBe('webp')
  })

  it('cai no fallback quando não há extensão utilizável', () => {
    expect(fileExtensionFromPath('extra-images/pptnc/v/story-1')).toBe('png')
    expect(fileExtensionFromPath('')).toBe('png')
  })
})
