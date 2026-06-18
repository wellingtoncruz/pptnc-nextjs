import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test-utils'

import PrivacyPolicyPage from './page'

describe('PrivacyPolicyPage', () => {
  it('renders the title and last-updated date', () => {
    render(<PrivacyPolicyPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Política de Privacidade' })
    ).toBeInTheDocument()
    expect(screen.getByText(/Última atualização:/)).toBeInTheDocument()
  })

  it('renders the core sections', () => {
    render(<PrivacyPolicyPage />)
    expect(screen.getByRole('heading', { name: /Informações que coletamos/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Como usamos as informações/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Seus direitos/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^13\. Contato/ })).toBeInTheDocument()
  })

  it('exposes a contact e-mail and cross-links to terms', () => {
    render(<PrivacyPolicyPage />)
    expect(screen.getByRole('link', { name: /contato@/ })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:')
    )
    expect(screen.getByRole('link', { name: 'Termos de Serviço' })).toHaveAttribute('href', '/terms')
  })
})
