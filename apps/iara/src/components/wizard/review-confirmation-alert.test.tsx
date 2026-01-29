import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test-utils'

import { ReviewConfirmationAlert } from './review-confirmation-alert'

describe('ReviewConfirmationAlert', () => {
  describe('Rendering', () => {
    it('renders the title "Revisão Pendente"', () => {
      render(
        <ReviewConfirmationAlert
          phaseName="checagem de edição"
          onConfirm={vi.fn()}
        />
      )

      expect(screen.getByText('Revisão Pendente')).toBeInTheDocument()
    })

    it('renders the phase name in the description', () => {
      render(
        <ReviewConfirmationAlert
          phaseName="checagem de edição"
          onConfirm={vi.fn()}
        />
      )

      expect(screen.getByText(/checagem de edição/i)).toBeInTheDocument()
    })

    it('renders the confirm button with correct text', () => {
      render(
        <ReviewConfirmationAlert
          phaseName="riscos de compliance"
          onConfirm={vi.fn()}
        />
      )

      const button = screen.getByRole('button', { name: /revisei e confirmo/i })
      expect(button).toBeInTheDocument()
    })
  })

  describe('Interaction', () => {
    it('calls onConfirm when button is clicked', () => {
      const onConfirm = vi.fn()
      render(
        <ReviewConfirmationAlert
          phaseName="checagem de edição"
          onConfirm={onConfirm}
        />
      )

      const button = screen.getByRole('button', { name: /revisei e confirmo/i })
      fireEvent.click(button)

      expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('does not call onConfirm when button is disabled', () => {
      const onConfirm = vi.fn()
      render(
        <ReviewConfirmationAlert
          phaseName="checagem de edição"
          onConfirm={onConfirm}
          isConfirming={true}
        />
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      expect(onConfirm).not.toHaveBeenCalled()
    })
  })

  describe('Loading state', () => {
    it('shows "Confirmando..." when isConfirming is true', () => {
      render(
        <ReviewConfirmationAlert
          phaseName="checagem de edição"
          onConfirm={vi.fn()}
          isConfirming={true}
        />
      )

      expect(screen.getByText('Confirmando...')).toBeInTheDocument()
    })

    it('disables button when isConfirming is true', () => {
      render(
        <ReviewConfirmationAlert
          phaseName="checagem de edição"
          onConfirm={vi.fn()}
          isConfirming={true}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('enables button when isConfirming is false', () => {
      render(
        <ReviewConfirmationAlert
          phaseName="checagem de edição"
          onConfirm={vi.fn()}
          isConfirming={false}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toBeEnabled()
    })
  })

  describe('Accessibility', () => {
    it('has an accessible button', () => {
      render(
        <ReviewConfirmationAlert
          phaseName="checagem de edição"
          onConfirm={vi.fn()}
        />
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAccessibleName()
    })
  })
})
