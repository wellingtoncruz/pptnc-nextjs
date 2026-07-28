import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, render, screen, waitFor } from '@/test-utils'
import { DEFAULT_PROMPTS } from '@/lib/schemas'
import type { PromptField } from '@/types/podcast'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

// Import after mocks
import { PromptsSettingsForm } from './prompts-settings-form'

const defaultProps = {
  prompts: DEFAULT_PROMPTS,
  enabledSocialNetworks: [] as string[],
  socialNetworks: [] as Array<{ id: string; name: string; icon: string }>,
}

describe('PromptsSettingsForm', () => {
  const mockOnSavePromptField = vi.fn<
    (videoType: 'episode' | 'cut' | 'reel' | 'standalone', fieldName: string, value: PromptField) => Promise<void>
  >()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockOnSavePromptField.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders accordion with three video types', () => {
    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    expect(screen.getByText('Episódios')).toBeInTheDocument()
    expect(screen.getByText('Cortes')).toBeInTheDocument()
    expect(screen.getByText('Reels')).toBeInTheDocument()
  })

  it('expands episode accordion and shows prompt field editors', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      // Episode has 7 fields: critique, editing, compliance, chapters, titles, description, tags
      expect(screen.getByText('Crítica')).toBeInTheDocument()
      expect(screen.getByText('Edição')).toBeInTheDocument()
      expect(screen.getByText('Conformidade')).toBeInTheDocument()
      expect(screen.getByText('Capítulos')).toBeInTheDocument()
      expect(screen.getByText('Títulos')).toBeInTheDocument()
      expect(screen.getByText('Descrição')).toBeInTheDocument()
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })
  })

  it('expands cut accordion and shows correct fields', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Cortes'))

    await waitFor(() => {
      // Cut has 4 fields: titles, thumbs, description, tags
      expect(screen.getByText('Brief de Thumbnail (texto)')).toBeInTheDocument()
    })
  })

  it('renders the Avulsos (standalone) section and saves with videoType standalone', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    expect(screen.getByText('Avulsos')).toBeInTheDocument()
    await user.click(screen.getByText('Avulsos'))

    const titlesTextarea = document.getElementById('standalone-titles-description') as HTMLTextAreaElement
    await user.clear(titlesTextarea)
    await user.type(titlesTextarea, 'Títulos para avulso')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSavePromptField).toHaveBeenCalledWith(
        'standalone',
        'titles',
        expect.objectContaining({ description: 'Títulos para avulso' })
      )
    })
  })

  it('calls onSavePromptField with correct videoType and fieldName', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Episódios'))

    // PromptFieldEditor renders id={`${fieldKey}-description`} for each textarea
    const critiqueTextarea = document.getElementById('episode-critique-description') as HTMLTextAreaElement
    await user.clear(critiqueTextarea)
    await user.type(critiqueTextarea, 'New critique description')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSavePromptField).toHaveBeenCalledWith(
        'episode',
        'critique',
        expect.objectContaining({ description: 'New critique description' })
      )
    })
  })

  it('collapses other accordion items when one is expanded', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    // Expand episode
    await user.click(screen.getByText('Episódios'))
    await waitFor(() => {
      expect(screen.getByText('Crítica')).toBeVisible()
    })

    // Expand cut
    await user.click(screen.getByText('Cortes'))
    await waitFor(() => {
      expect(screen.getByText('Brief de Thumbnail (texto)')).toBeVisible()
    })

    // Episode content should be collapsed (content not visible)
    // Note: The content is still in DOM but accordion hides it
  })

  it('shows all field labels in PT-BR', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    // Check episode fields
    await user.click(screen.getByText('Episódios'))
    await waitFor(() => {
      expect(screen.getByText('Crítica')).toBeInTheDocument()
      expect(screen.getByText('Edição')).toBeInTheDocument()
      expect(screen.getByText('Conformidade')).toBeInTheDocument()
      expect(screen.getByText('Capítulos')).toBeInTheDocument()
    })

    // Check cut fields
    await user.click(screen.getByText('Cortes'))
    await waitFor(() => {
      expect(screen.getByText('Brief de Thumbnail (texto)')).toBeInTheDocument()
    })
  })

  it('does NOT render social prompts subsection when enabledSocialNetworks is empty', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      expect(screen.getByText('Crítica')).toBeInTheDocument()
    })

    expect(screen.queryByText('Redes Sociais')).not.toBeInTheDocument()
  })

  it('renders social prompts subsection with enabled networks', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm
        {...defaultProps}
        enabledSocialNetworks={['instagram']}
        socialNetworks={[{ id: 'instagram', name: 'Instagram', icon: '📷' }]}
        onSavePromptField={mockOnSavePromptField}
      />
    )

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      expect(screen.getByText('Redes Sociais')).toBeInTheDocument()
      expect(screen.getByText('📷 Instagram')).toBeInTheDocument()
    })
  })

  it('renders social prompts in Cut section when networks enabled', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm
        {...defaultProps}
        enabledSocialNetworks={['linkedin']}
        socialNetworks={[{ id: 'linkedin', name: 'LinkedIn', icon: '💼' }]}
        onSavePromptField={mockOnSavePromptField}
      />
    )

    await user.click(screen.getByText('Cortes'))

    await waitFor(() => {
      expect(screen.getByText('Redes Sociais')).toBeInTheDocument()
      expect(screen.getByText('💼 LinkedIn')).toBeInTheDocument()
    })
  })

  it('renders social prompts in Reel section when networks enabled', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm
        {...defaultProps}
        enabledSocialNetworks={['instagram']}
        socialNetworks={[{ id: 'instagram', name: 'Instagram', icon: '📷' }]}
        onSavePromptField={mockOnSavePromptField}
      />
    )

    await user.click(screen.getByText('Reels'))

    await waitFor(() => {
      expect(screen.getByText('Redes Sociais')).toBeInTheDocument()
      expect(screen.getByText('📷 Instagram')).toBeInTheDocument()
    })
  })

  it('shows AdWords prompt field in Episode section', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      expect(screen.getByText('Tráfego Pago')).toBeInTheDocument()
      expect(screen.getByText('AdWords')).toBeInTheDocument()
    })
  })

  it('does NOT show AdWords prompt in Cut section', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Cortes'))

    await waitFor(() => {
      expect(screen.getByText('Brief de Thumbnail (texto)')).toBeInTheDocument()
    })

    expect(screen.queryByText('Tráfego Pago')).not.toBeInTheDocument()
    expect(screen.queryByText('AdWords')).not.toBeInTheDocument()
  })

  it('does NOT show AdWords prompt in Reel section', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Reels'))

    await waitFor(() => {
      expect(screen.getByText('Títulos')).toBeInTheDocument()
    })

    expect(screen.queryByText('Tráfego Pago')).not.toBeInTheDocument()
    expect(screen.queryByText('AdWords')).not.toBeInTheDocument()
  })

  it('calls onSavePromptField with adwords fieldName for AdWords prompt', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      expect(screen.getByText('AdWords')).toBeInTheDocument()
    })

    // PromptFieldEditor renders id={`${fieldKey}-description`} for each textarea
    const adwordsTextarea = document.getElementById('episode-adwords-description') as HTMLTextAreaElement
    await user.clear(adwordsTextarea)
    await user.type(adwordsTextarea, 'AdWords optimization guide')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSavePromptField).toHaveBeenCalledWith(
        'episode',
        'adwords',
        expect.objectContaining({ description: 'AdWords optimization guide' })
      )
    })
  })

  it('calls onSavePromptField with social.networkId fieldName for social prompt', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm
        {...defaultProps}
        enabledSocialNetworks={['instagram']}
        socialNetworks={[{ id: 'instagram', name: 'Instagram', icon: '📷' }]}
        onSavePromptField={mockOnSavePromptField}
      />
    )

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      expect(screen.getByText('📷 Instagram')).toBeInTheDocument()
    })

    // PromptFieldEditor renders id={`${fieldKey}-description`} for each textarea
    const socialTextarea = document.getElementById('episode-social-instagram-description') as HTMLTextAreaElement
    await user.clear(socialTextarea)
    await user.type(socialTextarea, 'Social prompt description')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSavePromptField).toHaveBeenCalledWith(
        'episode',
        'social.instagram',
        expect.objectContaining({ description: 'Social prompt description' })
      )
    })
  })

  it('shows Newsletter prompts in Episode section', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      expect(screen.getByText('Newsletter')).toBeInTheDocument()
      expect(screen.getByText('Draft')).toBeInTheDocument()
      expect(screen.getByText('Notícias')).toBeInTheDocument()
      expect(screen.getByText('Imagem')).toBeInTheDocument()
      expect(screen.getByText('Formato')).toBeInTheDocument()
    })
  })

  it('does NOT show Newsletter prompts in Cut section', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Cortes'))

    await waitFor(() => {
      expect(screen.getByText('Brief de Thumbnail (texto)')).toBeInTheDocument()
    })

    expect(screen.queryByText('Newsletter')).not.toBeInTheDocument()
  })

  it('does NOT show Newsletter prompts in Reel section', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Reels'))

    await waitFor(() => {
      expect(screen.getByText('Títulos')).toBeInTheDocument()
    })

    expect(screen.queryByText('Newsletter')).not.toBeInTheDocument()
  })

  it('does NOT render news prompts section (moved to SettingsPageClient)', () => {
    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    expect(screen.queryByText('Prompts por Recursos')).not.toBeInTheDocument()
    expect(screen.queryByText('Prompts por Recurso')).not.toBeInTheDocument()
  })

  it('calls onSavePromptField with newsletter.draft fieldName', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
    )

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })

    // PromptFieldEditor renders id={`${fieldKey}-description`} for each textarea
    const draftTextarea = document.getElementById('episode-newsletter-draft-description') as HTMLTextAreaElement
    await user.clear(draftTextarea)
    await user.type(draftTextarea, 'Newsletter draft prompt')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })

    await waitFor(() => {
      expect(mockOnSavePromptField).toHaveBeenCalledWith(
        'episode',
        'newsletter.draft',
        expect.objectContaining({ description: 'Newsletter draft prompt' })
      )
    })
  })

  // =========================================================================
  // Epic 22 — Story 22.1 — Thumbnail subsection ordering
  // =========================================================================

  describe('Thumbnail subsection ordering (Epic 22)', () => {
    const mockOnSaveThumbnailPromptField = vi.fn<
      (videoType: 'episode' | 'cut', value: import('@/types/podcast').ThumbnailPromptField) => Promise<void>
    >()

    beforeEach(() => {
      mockOnSaveThumbnailPromptField.mockResolvedValue(undefined)
    })

    it('renders Thumbnail subsection in Episode immediately after Tags (and before Newsletter)', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(
        <PromptsSettingsForm
          {...defaultProps}
          onSavePromptField={mockOnSavePromptField}
          onSaveThumbnailPromptField={mockOnSaveThumbnailPromptField}
        />
      )

      await user.click(screen.getByText('Episódios'))

      await waitFor(() => {
        expect(screen.getByText('Geração de Thumbnail (imagem)')).toBeInTheDocument()
      })

      // Verify DOM order: Tags → Geração de Thumbnail (imagem) → Newsletter
      const tagsHeading = screen.getByText('Tags')
      const thumbnailHeading = screen.getByText('Geração de Thumbnail (imagem)')
      const newsletterHeading = screen.getByText('Newsletter')

      const tagsPos = tagsHeading.compareDocumentPosition(thumbnailHeading)
      expect(tagsPos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

      const thumbnailPos = thumbnailHeading.compareDocumentPosition(newsletterHeading)
      expect(thumbnailPos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('renders Thumbnail subsection in Cut immediately after Tags', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(
        <PromptsSettingsForm
          {...defaultProps}
          onSavePromptField={mockOnSavePromptField}
          onSaveThumbnailPromptField={mockOnSaveThumbnailPromptField}
        />
      )

      await user.click(screen.getByText('Cortes'))

      await waitFor(() => {
        expect(screen.getByText('Geração de Thumbnail (imagem)')).toBeInTheDocument()
      })

      const cutTagsHeadings = screen.getAllByText('Tags')
      // The Cut tab has its own "Tags" heading (the Episode one also exists in DOM after expand).
      // We want the one inside the cut accordion — pick the last occurrence as the cut tab was opened most recently.
      const cutTagsHeading = cutTagsHeadings[cutTagsHeadings.length - 1]
      const cutThumbnailHeading = screen.getByText('Geração de Thumbnail (imagem)')

      const pos = cutTagsHeading.compareDocumentPosition(cutThumbnailHeading)
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('does NOT render Thumbnail subsection when onSaveThumbnailPromptField handler is absent', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(
        <PromptsSettingsForm {...defaultProps} onSavePromptField={mockOnSavePromptField} />
      )

      await user.click(screen.getByText('Episódios'))

      await waitFor(() => {
        expect(screen.getByText('Tags')).toBeInTheDocument()
      })

      expect(screen.queryByText('Geração de Thumbnail (imagem)')).not.toBeInTheDocument()
    })

    it('does NOT render Thumbnail subsection in Reels (Epic 22 covers only episode and cut)', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(
        <PromptsSettingsForm
          {...defaultProps}
          onSavePromptField={mockOnSavePromptField}
          onSaveThumbnailPromptField={mockOnSaveThumbnailPromptField}
        />
      )

      await user.click(screen.getByText('Reels'))

      await waitFor(() => {
        expect(screen.getByText('Reels')).toBeInTheDocument()
      })

      // Reels accordion is open; if the heading appeared, it would be the only "Geração de Thumbnail (imagem)" in DOM.
      // Episode and Cut accordions are not expanded by default in this test, so they don't render their headings either.
      expect(screen.queryByText('Geração de Thumbnail (imagem)')).not.toBeInTheDocument()
    })
  })
})

/**
 * Epic 28 — Imagens Extras do Episódio (Story, Vitrine, Feed).
 *
 * Três blocos completos do mesmo editor do Thumbnail, cada um com Base e
 * Referência próprias. Só aparecem sob Episódios.
 */
describe('PromptsSettingsForm — Imagens Extras (Epic 28)', () => {
  const mockOnSavePromptField = vi.fn<
    (videoType: 'episode' | 'cut' | 'reel' | 'standalone', fieldName: string, value: PromptField) => Promise<void>
  >()
  const mockOnSaveExtraImagePromptField = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnSavePromptField.mockResolvedValue(undefined)
    mockOnSaveExtraImagePromptField.mockResolvedValue(undefined)
  })

  function renderForm(withHandler = true) {
    return render(
      <PromptsSettingsForm
        {...defaultProps}
        onSavePromptField={mockOnSavePromptField}
        onSaveExtraImagePromptField={withHandler ? mockOnSaveExtraImagePromptField : undefined}
      />
    )
  }

  it('renders the three kinds under Episódios', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      expect(screen.getByText('Imagens Extras (imagem)')).toBeInTheDocument()
    })
    expect(screen.getByText('Story')).toBeInTheDocument()
    expect(screen.getByText('Vitrine')).toBeInTheDocument()
    expect(screen.getByText('Feed')).toBeInTheDocument()
  })

  /** Par próprio por imagem = 6 slots de upload, 2 por kind. */
  it('gives each kind its own Base and Referência slots', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      expect(screen.getByLabelText('Story Base')).toBeInTheDocument()
    })
    for (const label of ['Story', 'Vitrine', 'Feed']) {
      expect(screen.getByLabelText(`${label} Base`)).toBeInTheDocument()
      expect(screen.getByLabelText(`${label} Referência`)).toBeInTheDocument()
    }
  })

  it('does not render the section when the save handler is absent', async () => {
    const user = userEvent.setup()
    renderForm(false)

    await user.click(screen.getByText('Episódios'))

    await waitFor(() => {
      expect(screen.getByText('Crítica')).toBeInTheDocument()
    })
    expect(screen.queryByText('Imagens Extras (imagem)')).not.toBeInTheDocument()
  })

  /** Episode-only: cortes e reels não ganham a seção. */
  it('does not render the section under Cortes', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByText('Cortes'))

    await waitFor(() => {
      expect(screen.getByText('Brief de Thumbnail (texto)')).toBeInTheDocument()
    })
    expect(screen.queryByText('Imagens Extras (imagem)')).not.toBeInTheDocument()
  })
})
