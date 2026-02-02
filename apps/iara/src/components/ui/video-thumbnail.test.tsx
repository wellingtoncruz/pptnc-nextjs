import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test-utils'

import { VideoThumbnail } from './video-thumbnail'

describe('VideoThumbnail', () => {
  const youtubeId = 'test-video-123'
  const customThumbnail = 'https://example.com/custom-thumbnail.jpg'

  describe('URL priority', () => {
    it('uses custom thumbnail when provided', () => {
      render(
        <VideoThumbnail
          youtubeId={youtubeId}
          thumbnailUrl={customThumbnail}
          alt="Test video"
        />
      )

      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('src', expect.stringContaining('custom-thumbnail.jpg'))
    })

    it('uses YouTube hqdefault when no custom thumbnail (guaranteed to exist)', () => {
      render(
        <VideoThumbnail
          youtubeId={youtubeId}
          thumbnailUrl={null}
          alt="Test video"
        />
      )

      const img = screen.getByRole('img')
      // hqdefault is used instead of maxresdefault because it's guaranteed to exist for ALL videos
      expect(img).toHaveAttribute('src', expect.stringContaining(`${youtubeId}/hqdefault.jpg`))
    })
  })

  describe('fallback behavior', () => {
    it('falls back to default.jpg when hqdefault fails', () => {
      render(
        <VideoThumbnail
          youtubeId={youtubeId}
          thumbnailUrl={null}
          alt="Test video"
        />
      )

      const img = screen.getByRole('img')
      // Starts with hqdefault
      expect(img).toHaveAttribute('src', expect.stringContaining(`${youtubeId}/hqdefault.jpg`))

      // Simulate error on hqdefault
      fireEvent.error(img)

      // Should now be default.jpg
      expect(img).toHaveAttribute('src', expect.stringContaining(`${youtubeId}/default.jpg`))
    })

    it('shows placeholder when all fallbacks fail', () => {
      render(
        <VideoThumbnail
          youtubeId={youtubeId}
          thumbnailUrl={null}
          alt="Test video"
        />
      )

      const img = screen.getByRole('img')

      // Simulate errors on all URLs (hqdefault and default.jpg)
      fireEvent.error(img) // hqdefault fails
      fireEvent.error(img) // default.jpg fails

      // Should show placeholder text
      expect(screen.getByText('Sem thumbnail')).toBeInTheDocument()
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('falls back from custom thumbnail to YouTube hqdefault', () => {
      render(
        <VideoThumbnail
          youtubeId={youtubeId}
          thumbnailUrl={customThumbnail}
          alt="Test video"
        />
      )

      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('src', expect.stringContaining('custom-thumbnail.jpg'))

      // Custom thumbnail fails
      fireEvent.error(img)

      // Should fall back to hqdefault (guaranteed to exist)
      expect(img).toHaveAttribute('src', expect.stringContaining(`${youtubeId}/hqdefault.jpg`))
    })
  })

  describe('props', () => {
    it('applies custom className', () => {
      render(
        <VideoThumbnail
          youtubeId={youtubeId}
          alt="Test video"
          className="custom-class"
        />
      )

      const img = screen.getByRole('img')
      expect(img).toHaveClass('custom-class')
    })

    it('uses provided alt text', () => {
      render(
        <VideoThumbnail
          youtubeId={youtubeId}
          alt="My test video thumbnail"
        />
      )

      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('alt', 'My test video thumbnail')
    })

    it('uses default dimensions', () => {
      render(
        <VideoThumbnail
          youtubeId={youtubeId}
          alt="Test video"
        />
      )

      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('width', '120')
      expect(img).toHaveAttribute('height', '68')
    })

    it('uses custom dimensions', () => {
      render(
        <VideoThumbnail
          youtubeId={youtubeId}
          alt="Test video"
          width={240}
          height={135}
        />
      )

      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('width', '240')
      expect(img).toHaveAttribute('height', '135')
    })
  })
})
