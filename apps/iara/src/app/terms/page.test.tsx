import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test-utils'

const { mockGetPodcastName } = vi.hoisted(() => ({ mockGetPodcastName: vi.fn() }))

vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastName: mockGetPodcastName,
}))

import TermsOfServicePage from './page'

describe('TermsOfServicePage', () => {
  beforeEach(() => {
    mockGetPodcastName.mockResolvedValue('PPT Não Compila')
  })

  it('renders the title and last-updated date', async () => {
    render(await TermsOfServicePage())
    expect(
      screen.getByRole('heading', { level: 1, name: 'Termos de Serviço' })
    ).toBeInTheDocument()
    expect(screen.getByText(/Última atualização:/)).toBeInTheDocument()
  })

  it('renders the core sections', async () => {
    render(await TermsOfServicePage())
    expect(screen.getByRole('heading', { name: /Aceitação dos termos/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Uso aceitável/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Limitação de responsabilidade/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^14\. Contato/ })).toBeInTheDocument()
  })

  it('exposes a contact e-mail and cross-links to the privacy policy', async () => {
    render(await TermsOfServicePage())
    expect(screen.getByRole('link', { name: /contato@/ })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:')
    )
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute(
      'href',
      '/privacy'
    )
  })

  // O rodapé é do TENANT: com um único podcast, o literal e o configurado eram
  // indistinguíveis — o 2º tenant expôs o nome do PPTNC em seis telas.
  it('shows the configured podcast name in the footer, never another tenant', async () => {
    mockGetPodcastName.mockResolvedValue('TrenDs News')
    render(await TermsOfServicePage())
    expect(screen.getByText(/IAra · TrenDs News/)).toBeInTheDocument()
    expect(screen.queryByText(/PPT Não Compila/)).not.toBeInTheDocument()
  })

  it('falls back to a bare "IAra" footer when there is no podcast name', async () => {
    mockGetPodcastName.mockResolvedValue(null)
    render(await TermsOfServicePage())
    expect(screen.getByText(/© \d{4} IAra$/)).toBeInTheDocument()
  })
})
