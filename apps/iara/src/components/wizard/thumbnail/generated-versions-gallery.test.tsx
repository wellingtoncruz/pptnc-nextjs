/**
 * Tests for GeneratedVersionsGallery — Epic 22 / Story 22.3d.
 *
 * Cobre a renderização da galeria, seleção via click, marcação visual da
 * versão ativa e o helper de tempo relativo.
 */

import { describe, expect, it, vi } from 'vitest'

import { render, screen } from '@/test-utils'

import {
  formatRelativeTime,
  GeneratedVersionsGallery,
  type GeneratedThumbnailVersion,
} from './generated-versions-gallery'

const sampleVersion = (overrides: Partial<GeneratedThumbnailVersion> = {}): GeneratedThumbnailVersion => ({
  id: overrides.id ?? `v-${Math.random().toString(36).slice(2, 8)}`,
  url: overrides.url ?? 'data:image/svg+xml;base64,PHN2Zy8+',
  observation: overrides.observation,
  timestamp: overrides.timestamp ?? new Date(),
  source: overrides.source ?? 'generated',
})

describe('GeneratedVersionsGallery', () => {
  it('renders nothing when there are no versions', () => {
    render(
      <GeneratedVersionsGallery versions={[]} selectedUrl={undefined} onSelect={() => {}} />
    )
    expect(screen.queryByTestId('generated-versions-gallery')).toBeNull()
  })

  it('renders every version when at least one is present', () => {
    const versions = [
      sampleVersion({ id: 'a', url: 'data:a' }),
      sampleVersion({ id: 'b', url: 'data:b' }),
      sampleVersion({ id: 'c', url: 'data:c' }),
    ]
    render(
      <GeneratedVersionsGallery versions={versions} selectedUrl="data:b" onSelect={() => {}} />
    )
    expect(screen.getByTestId('generated-versions-gallery')).toBeInTheDocument()
    expect(screen.getAllByTestId('version-card')).toHaveLength(3)
    expect(screen.getByText('Versões (3)')).toBeInTheDocument()
  })

  it('marks the version whose URL matches selectedUrl as selected', () => {
    const versions = [
      sampleVersion({ id: 'a', url: 'data:a' }),
      sampleVersion({ id: 'b', url: 'data:b' }),
    ]
    render(
      <GeneratedVersionsGallery versions={versions} selectedUrl="data:b" onSelect={() => {}} />
    )
    const [first, second] = screen.getAllByTestId('version-card')
    expect(first).toHaveAttribute('data-selected', 'false')
    expect(second).toHaveAttribute('data-selected', 'true')
    const [firstSelect, secondSelect] = screen.getAllByTestId('version-select-button')
    expect(firstSelect).toHaveAttribute('aria-pressed', 'false')
    expect(secondSelect).toHaveAttribute('aria-pressed', 'true')
  })

  it('marks no version as selected when selectedUrl does not match', () => {
    const versions = [sampleVersion({ id: 'a', url: 'data:a' })]
    render(
      <GeneratedVersionsGallery versions={versions} selectedUrl="data:other" onSelect={() => {}} />
    )
    expect(screen.getByTestId('version-card')).toHaveAttribute('data-selected', 'false')
  })

  it('calls onSelect with the version URL when the miniature is clicked', () => {
    const versions = [
      sampleVersion({ id: 'a', url: 'data:a' }),
      sampleVersion({ id: 'b', url: 'data:b' }),
    ]
    const onSelect = vi.fn()
    render(
      <GeneratedVersionsGallery versions={versions} selectedUrl="data:a" onSelect={onSelect} />
    )
    screen.getAllByTestId('version-select-button')[1].click()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('data:b')
  })

  it('shows the Expand preview button only when onPreview is provided', () => {
    const versions = [sampleVersion({ id: 'a', url: 'data:a' })]

    const { rerender } = render(
      <GeneratedVersionsGallery versions={versions} selectedUrl={undefined} onSelect={() => {}} />
    )
    expect(screen.queryByTestId('version-preview-button')).toBeNull()

    rerender(
      <GeneratedVersionsGallery
        versions={versions}
        selectedUrl={undefined}
        onSelect={() => {}}
        onPreview={() => {}}
      />
    )
    expect(screen.getByTestId('version-preview-button')).toBeInTheDocument()
  })

  it('calls onPreview with the version URL without triggering onSelect', () => {
    const versions = [sampleVersion({ id: 'a', url: 'data:a' })]
    const onSelect = vi.fn()
    const onPreview = vi.fn()
    render(
      <GeneratedVersionsGallery
        versions={versions}
        selectedUrl={undefined}
        onSelect={onSelect}
        onPreview={onPreview}
      />
    )
    screen.getByTestId('version-preview-button').click()
    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onPreview).toHaveBeenCalledWith('data:a')
    // The select button must NOT be triggered when the producer only wants to preview.
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows the observation as the card label (truncated when longer than 48 chars)', () => {
    const long = 'destaque o convidado com um plano fechado e fundo escuro sem texto sobreposto na arte'
    const versions = [sampleVersion({ id: 'a', observation: long, url: 'data:a' })]
    render(
      <GeneratedVersionsGallery versions={versions} selectedUrl={undefined} onSelect={() => {}} />
    )
    const label = screen.getByText(/destaque o convidado/)
    expect(label.textContent?.endsWith('…')).toBe(true)
    expect((label.textContent ?? '').length).toBeLessThanOrEqual(48)
  })

  it('falls back to "Sem observação" when observation is undefined for a generated version', () => {
    const versions = [
      sampleVersion({ id: 'a', observation: undefined, source: 'generated', url: 'data:a' }),
      sampleVersion({ id: 'b', observation: '   ', source: 'generated', url: 'data:b' }),
    ]
    render(
      <GeneratedVersionsGallery versions={versions} selectedUrl="data:a" onSelect={() => {}} />
    )
    expect(screen.getAllByText('Sem observação')).toHaveLength(2)
  })

  it('uses "Upload manual" as the label when source=upload and there is no observation', () => {
    const versions = [
      sampleVersion({ id: 'a', observation: undefined, source: 'upload', url: 'data:a' }),
      sampleVersion({ id: 'b', observation: '   ', source: 'upload', url: 'data:b' }),
    ]
    render(
      <GeneratedVersionsGallery versions={versions} selectedUrl="data:a" onSelect={() => {}} />
    )
    expect(screen.getAllByText('Upload manual')).toHaveLength(2)
    expect(screen.queryByText('Sem observação')).toBeNull()
  })

  it('uses an img tag for each miniature pointing at the version URL', () => {
    const versions = [sampleVersion({ id: 'a', url: 'data:image/svg+xml;base64,PHN2Zy8+' })]
    render(
      <GeneratedVersionsGallery versions={versions} selectedUrl={undefined} onSelect={() => {}} />
    )
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'data:image/svg+xml;base64,PHN2Zy8+')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-05-13T12:00:00Z')

  it('returns "agora" for diffs under 5 seconds', () => {
    expect(formatRelativeTime(new Date('2026-05-13T11:59:58Z'), now)).toBe('agora')
    expect(formatRelativeTime(new Date('2026-05-13T11:59:55.500Z'), now)).toBe('agora')
  })

  it('returns seconds for diffs between 5s and 60s', () => {
    expect(formatRelativeTime(new Date('2026-05-13T11:59:50Z'), now)).toBe('há 10s')
    expect(formatRelativeTime(new Date('2026-05-13T11:59:01Z'), now)).toBe('há 59s')
  })

  it('returns minutes for diffs between 1min and 60min', () => {
    expect(formatRelativeTime(new Date('2026-05-13T11:59:00Z'), now)).toBe('há 1min')
    expect(formatRelativeTime(new Date('2026-05-13T11:30:00Z'), now)).toBe('há 30min')
  })

  it('returns hours for diffs over 60min', () => {
    expect(formatRelativeTime(new Date('2026-05-13T10:00:00Z'), now)).toBe('há 2h')
  })
})
