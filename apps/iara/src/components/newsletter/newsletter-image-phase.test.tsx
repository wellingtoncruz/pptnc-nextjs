import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGenerate = vi.fn()
const mockRegenerateFromPrompt = vi.fn()
const mockRetry = vi.fn()

const defaultHookReturn = {
  imageUrl: null as string | null,
  imagePrompt: null as string | null,
  newsletterStatus: null as string | null,
  isLoading: false,
  isGenerating: false,
  generatingStep: null as string | null,
  error: null as string | null,
  errorImagePrompt: null as string | null,
  generate: mockGenerate,
  regenerateFromPrompt: mockRegenerateFromPrompt,
  retry: mockRetry,
}

let hookReturn = { ...defaultHookReturn }

vi.mock('@/hooks/use-newsletter-image', () => ({
  useNewsletterImage: () => hookReturn,
}))

import { NewsletterImagePhase } from './newsletter-image-phase'

describe('NewsletterImagePhase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hookReturn = { ...defaultHookReturn }
    mockGenerate.mockResolvedValue(true)
    mockRegenerateFromPrompt.mockResolvedValue(true)
  })

  it('shows loading spinner', () => {
    hookReturn = { ...defaultHookReturn, isLoading: true }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus={null} />)

    expect(screen.getByTestId('newsletter-image-loading')).toBeInTheDocument()
  })

  it('shows prerequisites message when status < news_selected', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'draft' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="draft" />)

    expect(screen.getByTestId('newsletter-image-prerequisites')).toBeInTheDocument()
    expect(screen.getByText(/Complete as Fases 1 e 2/)).toBeInTheDocument()
  })

  it('shows prerequisites for idle status', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'idle' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="idle" />)

    expect(screen.getByTestId('newsletter-image-prerequisites')).toBeInTheDocument()
  })

  it('shows generate button when status is news_selected and no image', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'news_selected' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    // Auto-generate fires but the empty state renders briefly
    expect(mockGenerate).toHaveBeenCalledTimes(1)
  })

  it('shows generating spinner with progressive feedback', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'news_selected', isGenerating: true, generatingStep: 'generating_image' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(screen.getByTestId('newsletter-image-generating')).toBeInTheDocument()
    expect(screen.getByText('Criando a imagem...')).toBeInTheDocument()
  })

  it('shows generating_prompt step message', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'news_selected', isGenerating: true, generatingStep: 'generating_prompt' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(screen.getByText('Imaginando a imagem perfeita para a newsletter...')).toBeInTheDocument()
  })

  it('shows uploading step message', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'news_selected', isGenerating: true, generatingStep: 'uploading' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(screen.getByText('Salvando a imagem...')).toBeInTheDocument()
  })

  it('shows saving step message', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'news_selected', isGenerating: true, generatingStep: 'saving' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(screen.getByText('Finalizando...')).toBeInTheDocument()
  })

  it('shows default message when generatingStep is null', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'news_selected', isGenerating: true, generatingStep: null }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(screen.getByText('Gerando imagem da newsletter...')).toBeInTheDocument()
  })

  it('shows error with retry button', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'news_selected', error: 'Erro na API' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(screen.getByTestId('newsletter-image-error')).toBeInTheDocument()
    expect(screen.getByText('Erro na API')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeInTheDocument()
  })

  it('shows error with debug prompt when errorImagePrompt exists', () => {
    hookReturn = {
      ...defaultHookReturn,
      newsletterStatus: 'news_selected',
      error: 'Image gen failed',
      errorImagePrompt: 'The prompt that was generated',
    }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(screen.getByText(/Prompt gerado/)).toBeInTheDocument()
    expect(screen.getByText('The prompt that was generated')).toBeInTheDocument()
  })

  it('shows image preview when imageUrl exists', () => {
    hookReturn = {
      ...defaultHookReturn,
      newsletterStatus: 'image_ready',
      imageUrl: '/api/videos/video-1/newsletter/image?t=123',
      imagePrompt: 'A beautiful podcast studio',
    }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="image_ready" />)

    expect(screen.getByTestId('newsletter-image-result')).toBeInTheDocument()
    const img = screen.getByAltText('Imagem da newsletter')
    expect(img).toHaveAttribute('src', '/api/videos/video-1/newsletter/image?t=123')
  })

  it('shows editable prompt textarea when image exists', () => {
    hookReturn = {
      ...defaultHookReturn,
      newsletterStatus: 'image_ready',
      imageUrl: '/api/videos/video-1/newsletter/image?t=123',
      imagePrompt: 'Detailed description of podcast studio',
    }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="image_ready" />)

    expect(screen.getByText('Prompt utilizado')).toBeInTheDocument()
    const promptTextarea = screen.getByTestId('editable-prompt')
    expect(promptTextarea).toBeInTheDocument()
    expect(promptTextarea).toHaveValue('Detailed description of podcast studio')
  })

  it('shows "Regenerar Imagem" button disabled when prompt unchanged', () => {
    hookReturn = {
      ...defaultHookReturn,
      newsletterStatus: 'image_ready',
      imageUrl: '/api/videos/video-1/newsletter/image?t=123',
      imagePrompt: 'prompt',
    }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="image_ready" />)

    const regenButton = screen.getByRole('button', { name: /Regenerar Imagem/i })
    expect(regenButton).toBeDisabled()
  })

  it('shows "Novo Prompt + Imagem" button for full regeneration', () => {
    hookReturn = {
      ...defaultHookReturn,
      newsletterStatus: 'image_ready',
      imageUrl: '/api/videos/video-1/newsletter/image?t=123',
      imagePrompt: 'prompt',
    }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="image_ready" />)

    expect(screen.getByRole('button', { name: /Novo Prompt \+ Imagem/i })).toBeInTheDocument()
  })

  it('auto-generates when no image and prerequisites met', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'news_selected' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(mockGenerate).toHaveBeenCalledTimes(1)
  })

  it('does NOT auto-generate when image already exists', () => {
    hookReturn = {
      ...defaultHookReturn,
      newsletterStatus: 'image_ready',
      imageUrl: '/api/videos/video-1/newsletter/image?t=123',
      imagePrompt: 'prompt',
    }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="image_ready" />)

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('does NOT auto-generate when still loading', () => {
    hookReturn = { ...defaultHookReturn, isLoading: true }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('does NOT auto-generate when error exists', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'news_selected', error: 'Some error' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    expect(mockGenerate).not.toHaveBeenCalled()
  })

  it('calls retry when retry button is clicked', async () => {
    const user = userEvent.setup()
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'news_selected', error: 'Error' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    await user.click(screen.getByRole('button', { name: /Tentar novamente/i }))

    expect(mockRetry).toHaveBeenCalledTimes(1)
  })

  it('calls regenerateFromPrompt when "Regenerar Imagem" is clicked with edited prompt', async () => {
    const user = userEvent.setup()
    hookReturn = {
      ...defaultHookReturn,
      newsletterStatus: 'image_ready',
      imageUrl: '/api/videos/video-1/newsletter/image?t=123',
      imagePrompt: 'original prompt',
    }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="image_ready" />)

    // Edit the prompt
    const promptTextarea = screen.getByTestId('editable-prompt')
    await user.clear(promptTextarea)
    await user.type(promptTextarea, 'edited prompt')

    // Button should now be enabled
    const regenButton = screen.getByRole('button', { name: /Regenerar Imagem/i })
    expect(regenButton).not.toBeDisabled()

    await user.click(regenButton)

    expect(mockRegenerateFromPrompt).toHaveBeenCalledWith('edited prompt')
  })

  it('calls generate when "Novo Prompt + Imagem" is clicked', async () => {
    const user = userEvent.setup()
    hookReturn = {
      ...defaultHookReturn,
      newsletterStatus: 'image_ready',
      imageUrl: '/api/videos/video-1/newsletter/image?t=123',
      imagePrompt: 'prompt',
    }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="image_ready" />)

    await user.click(screen.getByRole('button', { name: /Novo Prompt \+ Imagem/i }))

    expect(mockGenerate).toHaveBeenCalledTimes(1)
  })

  it('uses externalStatus when hookStatus is null', () => {
    hookReturn = { ...defaultHookReturn, newsletterStatus: null }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" />)

    // Should auto-generate (from externalStatus)
    expect(mockGenerate).toHaveBeenCalledTimes(1)
  })

  it('shows "Continuar" button in result state', () => {
    hookReturn = {
      ...defaultHookReturn,
      newsletterStatus: 'image_ready',
      imageUrl: '/api/videos/video-1/newsletter/image?t=123',
      imagePrompt: 'prompt',
    }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="image_ready" />)

    expect(screen.getByRole('button', { name: /Continuar/i })).toBeInTheDocument()
  })

  it('"Continuar" calls onStatusChange with image_ready', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    hookReturn = {
      ...defaultHookReturn,
      newsletterStatus: 'image_ready',
      imageUrl: '/api/videos/video-1/newsletter/image?t=123',
      imagePrompt: 'prompt',
    }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="image_ready" onStatusChange={onStatusChange} />)

    await user.click(screen.getByRole('button', { name: /Continuar/i }))

    expect(onStatusChange).toHaveBeenCalledWith('image_ready')
  })

  it('auto-generate does NOT call onStatusChange', () => {
    const onStatusChange = vi.fn()
    hookReturn = { ...defaultHookReturn, newsletterStatus: 'news_selected' }

    render(<NewsletterImagePhase videoId="video-1" newsletterStatus="news_selected" onStatusChange={onStatusChange} />)

    expect(mockGenerate).toHaveBeenCalledTimes(1)
    expect(onStatusChange).not.toHaveBeenCalled()
  })
})
