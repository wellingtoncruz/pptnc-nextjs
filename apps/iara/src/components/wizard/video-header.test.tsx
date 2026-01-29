import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test-utils'

import { VideoHeader, VideoMetadata } from './video-header'
import type { Video } from '@/types/video'

// Mock video data
const mockVideo: Video = {
  id: 'test-video-123',
  podcastId: 'test-podcast',
  title: 'Episódio Teste sobre Tecnologia',
  description: 'Uma descrição de teste',
  thumbnail: 'https://example.com/thumb.jpg',
  duration: 3661, // 1:01:01
  publishedAt: '2024-01-15T10:00:00Z',
  status: 'processing',
  videoType: 'episode',
  createdAt: { toDate: () => new Date('2024-01-15T10:00:00Z') } as never,
  updatedAt: { toDate: () => new Date('2024-01-20T15:30:00Z') } as never,
}

describe('VideoHeader', () => {
  describe('Title display (AC1)', () => {
    it('renders video title', () => {
      render(<VideoHeader video={mockVideo} />)
      expect(screen.getByText('Episódio Teste sobre Tecnologia')).toBeInTheDocument()
    })

    it('renders video title in h2 element', () => {
      render(<VideoHeader video={mockVideo} />)
      const heading = screen.getByRole('heading', { level: 2 })
      expect(heading).toHaveTextContent('Episódio Teste sobre Tecnologia')
    })

    it('shows placeholder when title is empty', () => {
      const videoWithoutTitle = { ...mockVideo, title: '' }
      render(<VideoHeader video={videoWithoutTitle} />)
      expect(screen.getByText('Vídeo sem título')).toBeInTheDocument()
    })

    it('shows placeholder when title is undefined', () => {
      const videoWithoutTitle = { ...mockVideo, title: undefined as unknown as string }
      render(<VideoHeader video={videoWithoutTitle} />)
      expect(screen.getByText('Vídeo sem título')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(<VideoHeader video={mockVideo} className="custom-class" />)
      const headerDiv = document.querySelector('.space-y-2.custom-class')
      expect(headerDiv).toBeInTheDocument()
    })
  })
})

describe('VideoMetadata', () => {
  describe('Metadata display (AC2 - item 1.b)', () => {
    it('renders created date formatted in pt-BR', () => {
      render(<VideoMetadata video={mockVideo} />)
      // 15 Jan 2024 in pt-BR format
      expect(screen.getByText(/criado em 15 jan 2024/i)).toBeInTheDocument()
    })

    it('renders updated date formatted in pt-BR with time', () => {
      render(<VideoMetadata video={mockVideo} />)
      // Check that the update info is rendered (time depends on timezone)
      const updateElement = screen.getByText(/atualizado.*jan.*2024.*às.*\d{2}:\d{2}/i)
      expect(updateElement).toBeInTheDocument()
    })

    it('renders duration in HH:MM:SS format', () => {
      render(<VideoMetadata video={mockVideo} />)
      // 3661 seconds = 01:01:01
      expect(screen.getByText('01:01:01')).toBeInTheDocument()
    })

    it('handles missing createdAt gracefully', () => {
      const videoWithoutCreatedAt = { ...mockVideo, createdAt: undefined }
      render(<VideoMetadata video={videoWithoutCreatedAt} />)
      expect(screen.queryByText(/criado em/i)).not.toBeInTheDocument()
    })

    it('handles missing updatedAt gracefully', () => {
      const videoWithoutUpdatedAt = { ...mockVideo, updatedAt: undefined }
      render(<VideoMetadata video={videoWithoutUpdatedAt} />)
      expect(screen.queryByText(/atualizado/i)).not.toBeInTheDocument()
    })

    it('handles missing duration gracefully', () => {
      const videoWithoutDuration = { ...mockVideo, duration: undefined as unknown as number }
      render(<VideoMetadata video={videoWithoutDuration} />)
      expect(screen.queryByText(/\d{2}:\d{2}:\d{2}/)).not.toBeInTheDocument()
    })
  })

  describe('Duration formatting', () => {
    it('formats short duration correctly (< 1 hour)', () => {
      const shortVideo = { ...mockVideo, duration: 125 } // 2:05
      render(<VideoMetadata video={shortVideo} />)
      expect(screen.getByText('00:02:05')).toBeInTheDocument()
    })

    it('formats long duration correctly (> 1 hour)', () => {
      const longVideo = { ...mockVideo, duration: 7325 } // 2:02:05
      render(<VideoMetadata video={longVideo} />)
      expect(screen.getByText('02:02:05')).toBeInTheDocument()
    })

    it('does not show duration when zero', () => {
      const zeroVideo = { ...mockVideo, duration: 0 }
      render(<VideoMetadata video={zeroVideo} />)
      // Zero duration should not display (falsy check)
      expect(screen.queryByText('00:00:00')).not.toBeInTheDocument()
    })
  })

  describe('Layout and styling', () => {
    it('applies custom className', () => {
      render(<VideoMetadata video={mockVideo} className="custom-class" />)
      const metadataDiv = document.querySelector('.custom-class')
      expect(metadataDiv).toBeInTheDocument()
    })

    it('has compact layout with all metadata in single row', () => {
      render(<VideoMetadata video={mockVideo} />)
      // All metadata items should be present
      expect(screen.getByText(/criado em/i)).toBeInTheDocument()
      expect(screen.getByText(/atualizado/i)).toBeInTheDocument()
      expect(screen.getByText('01:01:01')).toBeInTheDocument()
    })
  })

  describe('Serialized Firestore timestamp formats', () => {
    it('handles _seconds format from API', () => {
      const videoWithSerializedTimestamp = {
        ...mockVideo,
        createdAt: { _seconds: 1705312800, _nanoseconds: 0 } as never, // 2024-01-15T10:00:00Z
        updatedAt: { _seconds: 1705765800, _nanoseconds: 0 } as never, // 2024-01-20T15:30:00Z
      }
      render(<VideoMetadata video={videoWithSerializedTimestamp} />)
      expect(screen.getByText(/criado em/i)).toBeInTheDocument()
      expect(screen.getByText(/atualizado/i)).toBeInTheDocument()
    })

    it('handles seconds format (alternate)', () => {
      const videoWithSecondsTimestamp = {
        ...mockVideo,
        createdAt: { seconds: 1705312800, nanoseconds: 0 } as never,
        updatedAt: { seconds: 1705765800, nanoseconds: 0 } as never,
      }
      render(<VideoMetadata video={videoWithSecondsTimestamp} />)
      expect(screen.getByText(/criado em/i)).toBeInTheDocument()
      expect(screen.getByText(/atualizado/i)).toBeInTheDocument()
    })

    it('handles ISO string format', () => {
      const videoWithISOString = {
        ...mockVideo,
        createdAt: '2024-01-15T10:00:00Z' as never,
        updatedAt: '2024-01-20T15:30:00Z' as never,
      }
      render(<VideoMetadata video={videoWithISOString} />)
      expect(screen.getByText(/criado em/i)).toBeInTheDocument()
      expect(screen.getByText(/atualizado/i)).toBeInTheDocument()
    })
  })
})
