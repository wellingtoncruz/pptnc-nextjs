/**
 * Tests for ThumbnailLightbox — Epic 22 / Story 22.3d.
 *
 * O componente é controlado: pai passa `url` em estado (null = fechado) e
 * uma callback `onClose`. Como o Radix Dialog renderiza num portal, usamos
 * o `screen` global em vez de inspecionar o container retornado.
 */

import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test-utils'

import { ThumbnailLightbox } from './thumbnail-lightbox'

describe('ThumbnailLightbox', () => {
  it('does not render the dialog when url is null', () => {
    render(<ThumbnailLightbox url={null} onClose={() => {}} />)
    expect(screen.queryByTestId('thumbnail-lightbox')).toBeNull()
  })

  it('renders the image at the provided URL when url is set', () => {
    render(<ThumbnailLightbox url="data:image/svg+xml;base64,PHN2Zy8+" onClose={() => {}} />)
    expect(screen.getByTestId('thumbnail-lightbox')).toBeInTheDocument()
    const img = screen.getByAltText('Thumbnail em tamanho real')
    expect(img).toHaveAttribute('src', 'data:image/svg+xml;base64,PHN2Zy8+')
  })

  it('uses the optional label for alt text and the accessible title', () => {
    render(
      <ThumbnailLightbox
        url="data:image/svg+xml;base64,PHN2Zy8+"
        onClose={() => {}}
        label="Versão gerada 3"
      />
    )
    expect(screen.getByAltText('Versão gerada 3')).toBeInTheDocument()
  })

  it('invokes onClose when the close button is activated', () => {
    const onClose = vi.fn()
    render(<ThumbnailLightbox url="data:foo" onClose={onClose} />)
    // The Radix dialog renders its own X button — find it via accessible name.
    const closeButton = screen.getByRole('button', { name: /close/i })
    closeButton.click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
