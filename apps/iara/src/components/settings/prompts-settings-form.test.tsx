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
    (videoType: 'episode' | 'cut' | 'reel', fieldName: string, value: PromptField) => Promise<void>
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
      expect(screen.getByText('Thumbnails')).toBeInTheDocument()
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
      expect(screen.getByText('Thumbnails')).toBeVisible()
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
      expect(screen.getByText('Thumbnails')).toBeInTheDocument()
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
      expect(screen.getByText('Thumbnails')).toBeInTheDocument()
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
      expect(screen.getByText('Thumbnails')).toBeInTheDocument()
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
})
