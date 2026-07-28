/**
 * Tests de `getExtendedPhaseState` — a função que decide se uma fase estendida
 * (parent, short-title, thumbnail, extra-images, links) conta como concluída.
 *
 * Ela governa a **navegação do breadcrumb**: `wizard-layout` só deixa clicar
 * numa fase estendida quando ela é a atual ou quando esta função devolve
 * 'completed'. Estava sem cobertura, e foi assim que o Epic 28 saiu com a fase
 * Imagens Extras inalcançável ao reabrir um vídeo (achado na homologação de
 * 2026-07-28).
 */
import { describe, expect, it } from 'vitest'

import { getExtendedPhaseState } from './wizard-breadcrumb'
import type { Video } from '@/types/video'

function makeVideo(overrides: Partial<Video> = {}): Video {
  return { id: 'vid1', videoType: 'episode', ...overrides } as unknown as Video
}

describe('getExtendedPhaseState', () => {
  it('devolve pending quando não há vídeo', () => {
    expect(getExtendedPhaseState('extra-images', undefined).status).toBe('pending')
  })

  describe('parent', () => {
    it('completed com parentEpisodeId', () => {
      expect(getExtendedPhaseState('parent', makeVideo({ parentEpisodeId: 'ep1' })).status).toBe(
        'completed'
      )
    })
    it('pending sem parentEpisodeId', () => {
      expect(getExtendedPhaseState('parent', makeVideo()).status).toBe('pending')
    })
  })

  describe('short-title', () => {
    it('completed com shortTitle', () => {
      expect(getExtendedPhaseState('short-title', makeVideo({ shortTitle: 'curto' })).status).toBe(
        'completed'
      )
    })
    it('pending sem shortTitle', () => {
      expect(getExtendedPhaseState('short-title', makeVideo()).status).toBe('pending')
    })
  })

  describe('thumbnail', () => {
    it('completed quando a URL veio do fluxo do wizard', () => {
      const video = makeVideo({
        storageThumbnailUrl: '/api/wizard/thumbnail/select?path=thumbnails/p/v/final-1.png',
      })
      expect(getExtendedPhaseState('thumbnail', video).status).toBe('completed')
    })

    /** Thumbnail automática do YouTube não é decisão do produtor. */
    it('pending para thumbnail importada do YouTube', () => {
      const video = makeVideo({ storageThumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg' })
      expect(getExtendedPhaseState('thumbnail', video).status).toBe('pending')
    })
  })

  describe('links', () => {
    it('completed com a marca de revisão', () => {
      expect(getExtendedPhaseState('links', makeVideo({ reviewedPhases: ['links'] })).status).toBe(
        'completed'
      )
    })
    it('pending sem a marca', () => {
      expect(getExtendedPhaseState('links', makeVideo({ reviewedPhases: [] })).status).toBe('pending')
    })
  })

  /**
   * Epic 28. A fase não exige nenhuma das três imagens, então a conclusão vem
   * da confirmação — não da presença de dados.
   */
  describe('extra-images', () => {
    it('completed com a marca de revisão, mesmo sem nenhuma imagem', () => {
      const video = makeVideo({ reviewedPhases: ['extra-images'] })
      expect(getExtendedPhaseState('extra-images', video).status).toBe('completed')
    })

    it('pending quando o produtor nunca passou pela fase', () => {
      expect(getExtendedPhaseState('extra-images', makeVideo()).status).toBe('pending')
    })

    it('pending com reviewedPhases de outras fases apenas', () => {
      const video = makeVideo({ reviewedPhases: ['links', 'risk'] })
      expect(getExtendedPhaseState('extra-images', video).status).toBe('pending')
    })

    /**
     * Fallback para vídeos que passaram pela fase ANTES da correção: têm
     * `extraImages` gravado mas nunca receberam a marca. Sem isso o breadcrumb
     * seguiria travado justamente nos vídeos já homologados.
     */
    it('completed por fallback quando há imagem mas falta a marca', () => {
      const video = makeVideo({
        extraImages: { feed: '/api/wizard/extra-images/select?path=extra-images/p/v/feed-1.png' },
      })
      expect(getExtendedPhaseState('extra-images', video).status).toBe('completed')
    })

    it('completed com qualquer um dos três kinds preenchido', () => {
      for (const kind of ['story', 'vitrine', 'feed'] as const) {
        const video = makeVideo({ extraImages: { [kind]: '/api/img.png' } })
        expect(getExtendedPhaseState('extra-images', video).status).toBe('completed')
      }
    })

    it('pending com extraImages presente porém vazio', () => {
      expect(getExtendedPhaseState('extra-images', makeVideo({ extraImages: {} })).status).toBe(
        'pending'
      )
    })

    it('pending quando as URLs são strings vazias', () => {
      const video = makeVideo({ extraImages: { story: '', vitrine: '', feed: '' } })
      expect(getExtendedPhaseState('extra-images', video).status).toBe('pending')
    })
  })
})
