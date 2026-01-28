import { describe, it, expect, vi } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'

import { render, screen } from '@/test-utils'
import { ContextInputsModal } from './context-inputs-modal'
import type { VideoSummary } from '@/types/video'

describe('ContextInputsModal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    videoType: 'episode' as const,
    videoTitle: 'Test Episode',
    onSubmit: vi.fn(),
  }

  describe('Episode mode', () => {
    it('renders episode form when videoType is episode', () => {
      render(<ContextInputsModal {...defaultProps} />)

      expect(screen.getByText('Informações do Episódio')).toBeInTheDocument()
      expect(screen.getByLabelText(/Tema do Episódio/)).toBeInTheDocument()
      expect(screen.getByText(/Co-host/)).toBeInTheDocument()
      expect(screen.getByText(/Convidados/)).toBeInTheDocument()
    })

    it('displays video title', () => {
      render(<ContextInputsModal {...defaultProps} />)

      expect(screen.getByText('Test Episode')).toBeInTheDocument()
    })

    it('shows validation errors when submitting empty form', async () => {
      render(<ContextInputsModal {...defaultProps} />)

      const submitButton = screen.getByRole('button', { name: /Iniciar Processamento/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/Tema é obrigatório/i)).toBeInTheDocument()
      })
    })

    it('calls onSubmit with form data when valid', async () => {
      const onSubmit = vi.fn()
      render(<ContextInputsModal {...defaultProps} onSubmit={onSubmit} />)

      // Fill theme
      const themeInput = screen.getByLabelText(/Tema do Episódio/i)
      fireEvent.change(themeInput, { target: { value: 'Tech Innovation' } })

      // The guest section should have inputs for Convidado 1
      // Find inputs within the guests section by their IDs
      const guestNameInput = screen.getByPlaceholderText(/Nome completo/i)
      const guestRoleInput = screen.getByPlaceholderText(/Ex: CEO, CTO/i)
      const guestCompanyInput = screen.getByPlaceholderText(/Nome da empresa/i)
      const guestLinkedinInput = screen.getByPlaceholderText(/linkedin.com/i)

      fireEvent.change(guestNameInput, { target: { value: 'Guest Name' } })
      fireEvent.change(guestRoleInput, { target: { value: 'CTO' } })
      fireEvent.change(guestCompanyInput, { target: { value: 'TechCorp' } })
      fireEvent.change(guestLinkedinInput, { target: { value: 'https://linkedin.com/in/guest' } })

      const submitButton = screen.getByRole('button', { name: /Iniciar Processamento/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            theme: 'Tech Innovation',
            guests: expect.arrayContaining([
              expect.objectContaining({
                name: 'Guest Name',
                role: 'CTO',
                company: 'TechCorp',
                linkedin: 'https://linkedin.com/in/guest',
              }),
            ]),
          })
        )
      })
    })

    it('closes modal when cancel is clicked', () => {
      const onOpenChange = vi.fn()
      render(<ContextInputsModal {...defaultProps} onOpenChange={onOpenChange} />)

      const cancelButton = screen.getByRole('button', { name: /Cancelar/i })
      fireEvent.click(cancelButton)

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('shows existing context when editing', () => {
      // Note: guests[0] is co-host when hasCoHost is true
      // In this test, we're just checking that existing data is populated
      const existingGuests = [
        {
          name: 'Existing Guest',
          role: 'CEO',
          company: 'ExistingCorp',
          linkedin: 'https://linkedin.com/in/existing',
        },
      ]

      render(
        <ContextInputsModal
          {...defaultProps}
          existingTheme="Existing Theme"
          existingGuests={existingGuests}
        />
      )

      expect(screen.getByDisplayValue('Existing Theme')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Existing Guest')).toBeInTheDocument()
    })
  })

  describe('Cut/Reel mode', () => {
    const cutProps = {
      ...defaultProps,
      videoType: 'cut' as const,
      videoTitle: 'Test Cut',
    }

    const mockEpisodes: VideoSummary[] = [
      {
        id: 'ep1',
        title: 'Episode 1',
        duration: 3600,
        status: 'draft',
        videoType: 'episode',
      },
      {
        id: 'ep2',
        title: 'Episode 2',
        duration: 3600,
        status: 'draft',
        videoType: 'episode',
      },
    ]

    it('renders episode selector when videoType is cut', () => {
      render(<ContextInputsModal {...cutProps} availableEpisodes={mockEpisodes} />)

      expect(screen.getByText('Selecionar Episódio de Origem')).toBeInTheDocument()
      // Check that there's a combobox for selecting episode
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('shows empty state when no episodes available', () => {
      render(<ContextInputsModal {...cutProps} availableEpisodes={[]} />)

      expect(screen.getByText(/Nenhum episódio com contexto disponível/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Voltar para a Lista/i })).toBeInTheDocument()
    })

    it('disables submit button when no episode selected', () => {
      render(<ContextInputsModal {...cutProps} availableEpisodes={mockEpisodes} />)

      const submitButton = screen.getByRole('button', { name: /Iniciar Processamento/i })
      expect(submitButton).toBeDisabled()
    })

    it('shows video title in cut mode', () => {
      render(<ContextInputsModal {...cutProps} availableEpisodes={mockEpisodes} />)

      expect(screen.getByText('Test Cut')).toBeInTheDocument()
    })
  })

  describe('Loading state', () => {
    it('shows loading state on buttons when isSubmitting', () => {
      render(<ContextInputsModal {...defaultProps} isSubmitting={true} />)

      expect(screen.getByRole('button', { name: /Salvando/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Cancelar/i })).toBeDisabled()
    })
  })
})
