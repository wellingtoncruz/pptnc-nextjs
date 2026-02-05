import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test-utils'

import {
  ClickableTimestamp,
  parseTimestampToSeconds,
  getYouTubeTimestampUrl,
  TIMESTAMP_CONTEXT_OFFSET_SECONDS,
} from './clickable-timestamp'
import { YouTubeProvider } from '../youtube-context'

// Mock seekTo function
const mockSeekTo = vi.fn()

// Mock the useYouTubeOptional hook
vi.mock('../youtube-context', async () => {
  const actual = await vi.importActual('../youtube-context')
  return {
    ...actual,
    useYouTubeOptional: () => ({
      seekTo: mockSeekTo,
      player: null,
      setPlayer: vi.fn(),
      isReady: false,
      registerStartPlayback: vi.fn(),
    }),
  }
})

describe('parseTimestampToSeconds', () => {
  it('parses MM:SS format correctly', () => {
    expect(parseTimestampToSeconds('05:30')).toBe(330)
    expect(parseTimestampToSeconds('00:00')).toBe(0)
    expect(parseTimestampToSeconds('59:59')).toBe(3599)
    expect(parseTimestampToSeconds('10:05')).toBe(605)
  })

  it('parses HH:MM:SS format correctly', () => {
    expect(parseTimestampToSeconds('01:05:30')).toBe(3930)
    expect(parseTimestampToSeconds('00:00:00')).toBe(0)
    expect(parseTimestampToSeconds('02:30:00')).toBe(9000)
    expect(parseTimestampToSeconds('01:00:00')).toBe(3600)
  })

  it('returns 0 for invalid formats', () => {
    expect(parseTimestampToSeconds('')).toBe(0)
    expect(parseTimestampToSeconds('invalid')).toBe(0)
    expect(parseTimestampToSeconds('12')).toBe(0)
    expect(parseTimestampToSeconds('aa:bb')).toBe(0)
  })
})

describe('getYouTubeTimestampUrl', () => {
  it('generates correct URL for MM:SS timestamp', () => {
    expect(getYouTubeTimestampUrl('abc123', '05:30')).toBe('https://youtu.be/abc123?t=330')
  })

  it('generates correct URL for HH:MM:SS timestamp', () => {
    expect(getYouTubeTimestampUrl('xyz789', '01:30:00')).toBe('https://youtu.be/xyz789?t=5400')
  })

  it('generates URL with t=0 for invalid timestamp', () => {
    expect(getYouTubeTimestampUrl('abc123', 'invalid')).toBe('https://youtu.be/abc123?t=0')
  })
})

describe('ClickableTimestamp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders timestamp text', () => {
    render(<ClickableTimestamp videoId="abc123" timestamp="05:30" />)
    expect(screen.getByText('05:30')).toBeInTheDocument()
  })

  it('renders as a button (not a link)', () => {
    render(<ClickableTimestamp videoId="abc123" timestamp="05:30" />)
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  it('has accessibility label', () => {
    render(<ClickableTimestamp videoId="abc123" timestamp="05:30" />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', 'Ir para 05:30 no vídeo')
  })

  it('applies custom className', () => {
    render(<ClickableTimestamp videoId="abc123" timestamp="05:30" className="custom-class" />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('custom-class')
  })

  describe('context offset', () => {
    it('exports context offset constant as 15 seconds', () => {
      expect(TIMESTAMP_CONTEXT_OFFSET_SECONDS).toBe(15)
    })

    it('applies 15s context offset by default when seeking', () => {
      // 05:30 = 330 seconds, with -15s offset = 315 seconds
      render(<ClickableTimestamp videoId="abc123" timestamp="05:30" />)
      const button = screen.getByRole('button')
      fireEvent.click(button)
      expect(mockSeekTo).toHaveBeenCalledWith(315)
    })

    it('does not seek below 0 seconds for early timestamps', () => {
      // 00:10 = 10 seconds, with -15s offset should clamp to 0
      render(<ClickableTimestamp videoId="abc123" timestamp="00:10" />)
      const button = screen.getByRole('button')
      fireEvent.click(button)
      expect(mockSeekTo).toHaveBeenCalledWith(0)
    })

    it('seeks to exact timestamp when applyContextOffset is false', () => {
      // 05:30 = 330 seconds, no offset
      render(<ClickableTimestamp videoId="abc123" timestamp="05:30" applyContextOffset={false} />)
      const button = screen.getByRole('button')
      fireEvent.click(button)
      expect(mockSeekTo).toHaveBeenCalledWith(330)
    })

    it('still displays original timestamp regardless of offset', () => {
      render(<ClickableTimestamp videoId="abc123" timestamp="05:30" />)
      // Should display 05:30, not 05:00
      expect(screen.getByText('05:30')).toBeInTheDocument()
    })
  })
})
