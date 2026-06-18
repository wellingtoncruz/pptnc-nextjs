import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test-utils'

import TermsOfServicePage from './page'

describe('TermsOfServicePage', () => {
  it('renders the title and last-updated date', () => {
    render(<TermsOfServicePage />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Termos de Serviço' })
    ).toBeInTheDocument()
    expect(screen.getByText(/Última atualização:/)).toBeInTheDocument()
  })

  it('renders the core sections', () => {
    render(<TermsOfServicePage />)
    expect(screen.getByRole('heading', { name: /Aceitação dos termos/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Uso aceitável/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Limitação de responsabilidade/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^14\. Contato/ })).toBeInTheDocument()
  })

  it('exposes a contact e-mail and cross-links to the privacy policy', () => {
    render(<TermsOfServicePage />)
    expect(screen.getByRole('link', { name: /contato@/ })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:')
    )
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute(
      'href',
      '/privacy'
    )
  })
})
