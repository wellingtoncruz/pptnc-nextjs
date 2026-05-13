import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { render, screen, waitFor } from '@/test-utils'
import { MAX_PROMPT_LENGTH } from '@/lib/schemas/podcast'

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

// Mock the global fetch used by the image upload flow.
const originalFetch = global.fetch
const fetchMock = vi.fn()

import { ThumbnailPromptFieldEditor } from './thumbnail-prompt-field-editor'

const emptyValue = { description: '', expectedOutput: '' }

const filledValue = {
  description: 'Generate a 16:9 thumbnail',
  expectedOutput: 'PNG image at 1280x720',
  baseImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config/pptnc/cut/base-1.png',
  baseImageMimeType: 'image/png',
  referenceImageUrl: '/api/settings/thumbnail-config?path=thumbnail-config/pptnc/cut/reference-1.png',
  referenceImageMimeType: 'image/png',
}

describe('ThumbnailPromptFieldEditor (Epic 22, Story 22.1)', () => {
  const mockOnSave = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof global.fetch
    mockOnSave.mockResolvedValue(undefined)
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders the four fields (description, expectedOutput, base image, reference image)', () => {
    render(
      <ThumbnailPromptFieldEditor
        fieldKey="cut-thumbnail"
        videoType="cut"
        initialValue={emptyValue}
        onSave={mockOnSave}
      />
    )

    expect(screen.getByText('Thumbnail')).toBeInTheDocument()
    expect(screen.getByLabelText('Descrição do Prompt')).toBeInTheDocument()
    expect(screen.getByLabelText('Saída Esperada')).toBeInTheDocument()
    expect(screen.getByLabelText('Thumbnail Base')).toBeInTheDocument()
    expect(screen.getByLabelText('Thumbnail Referência')).toBeInTheDocument()
  })

  it('shows existing image previews when initialValue carries URLs', () => {
    render(
      <ThumbnailPromptFieldEditor
        fieldKey="cut-thumbnail"
        videoType="cut"
        initialValue={filledValue}
        onSave={mockOnSave}
      />
    )

    expect(screen.getByAltText('Preview Thumbnail Base')).toHaveAttribute(
      'src',
      filledValue.baseImageUrl
    )
    expect(screen.getByAltText('Preview Thumbnail Referência')).toHaveAttribute(
      'src',
      filledValue.referenceImageUrl
    )
  })

  it('renders character counters with MAX_PROMPT_LENGTH', () => {
    render(
      <ThumbnailPromptFieldEditor
        fieldKey="episode-thumbnail"
        videoType="episode"
        initialValue={emptyValue}
        onSave={mockOnSave}
      />
    )

    // Two counters expected: description (initially 0) and output (initially 0)
    const counters = screen.getAllByText(`0 / ${MAX_PROMPT_LENGTH}`)
    expect(counters.length).toBe(2)
  })

  it('uploads to /api/settings/thumbnail-config and updates state on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        url: '/api/settings/thumbnail-config?path=thumbnail-config/pptnc/cut/base-999.png',
        mimeType: 'image/png',
      }),
    } as Response)

    render(
      <ThumbnailPromptFieldEditor
        fieldKey="cut-thumbnail"
        videoType="cut"
        initialValue={emptyValue}
        onSave={mockOnSave}
      />
    )

    const baseInput = screen.getByLabelText('Thumbnail Base') as HTMLInputElement
    const file = new File(['fake-binary'], 'base.png', { type: 'image/png' })

    Object.defineProperty(baseInput, 'files', {
      value: [file],
      configurable: true,
    })
    baseInput.dispatchEvent(new Event('change', { bubbles: true }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [calledUrl, init] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe('/api/settings/thumbnail-config')
    expect((init as RequestInit).method).toBe('POST')

    await waitFor(() => {
      expect(screen.getByAltText('Preview Thumbnail Base')).toHaveAttribute(
        'src',
        '/api/settings/thumbnail-config?path=thumbnail-config/pptnc/cut/base-999.png'
      )
    })
  })

  it('rejects oversized files client-side before fetching', async () => {
    render(
      <ThumbnailPromptFieldEditor
        fieldKey="cut-thumbnail"
        videoType="cut"
        initialValue={emptyValue}
        onSave={mockOnSave}
      />
    )

    const baseInput = screen.getByLabelText('Thumbnail Base') as HTMLInputElement
    // 6 MB file (limit is 5 MB)
    const oversized = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' })

    Object.defineProperty(baseInput, 'files', {
      value: [oversized],
      configurable: true,
    })
    baseInput.dispatchEvent(new Event('change', { bubbles: true }))

    await waitFor(() => {
      expect(screen.getByText('Imagem muito grande. Máximo 5 MB.')).toBeInTheDocument()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects unsupported MIME types client-side', async () => {
    render(
      <ThumbnailPromptFieldEditor
        fieldKey="cut-thumbnail"
        videoType="cut"
        initialValue={emptyValue}
        onSave={mockOnSave}
      />
    )

    const baseInput = screen.getByLabelText('Thumbnail Base') as HTMLInputElement
    const gif = new File(['x'], 'animated.gif', { type: 'image/gif' })

    Object.defineProperty(baseInput, 'files', {
      value: [gif],
      configurable: true,
    })
    baseInput.dispatchEvent(new Event('change', { bubbles: true }))

    await waitFor(() => {
      expect(screen.getByText('Formato inválido. Use PNG, JPEG ou WebP.')).toBeInTheDocument()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
