import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test-utils'

import { ProcessingSpinner } from './processing-spinner'

describe('ProcessingSpinner', () => {
  describe('Basic rendering (AC3)', () => {
    it('renders spinner icon', () => {
      render(<ProcessingSpinner />)
      // Loader2 icon should be present (check for animate-spin class)
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('has minimum height of 200px', () => {
      render(<ProcessingSpinner />)
      const container = document.querySelector('.min-h-\\[200px\\]')
      expect(container).toBeInTheDocument()
    })

    it('renders without text by default', () => {
      render(<ProcessingSpinner />)
      // Should only have the spinner, no text
      expect(screen.queryByRole('paragraph')).not.toBeInTheDocument()
    })
  })

  describe('Text display', () => {
    it('renders text when provided', () => {
      render(<ProcessingSpinner text="Processando..." />)
      expect(screen.getByText('Processando...')).toBeInTheDocument()
    })

    it('does not render text element when text is empty string', () => {
      render(<ProcessingSpinner text="" />)
      // Empty string is falsy, should not render text element
      const textElement = document.querySelector('p')
      expect(textElement).not.toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('applies custom className', () => {
      render(<ProcessingSpinner className="custom-test-class" />)
      const container = document.querySelector('.custom-test-class')
      expect(container).toBeInTheDocument()
    })

    it('has centered layout', () => {
      render(<ProcessingSpinner />)
      const container = document.querySelector('.flex.flex-col.items-center.justify-center')
      expect(container).toBeInTheDocument()
    })

    it('spinner has primary color', () => {
      render(<ProcessingSpinner />)
      const spinner = document.querySelector('.text-primary')
      expect(spinner).toBeInTheDocument()
    })
  })
})
