import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test-utils'

const { mockGetPodcastName } = vi.hoisted(() => ({ mockGetPodcastName: vi.fn() }))

vi.mock('@/lib/firebase/podcasts-admin', () => ({
  getPodcastName: mockGetPodcastName,
}))

import PrivacyPolicyPage from './page'

describe('PrivacyPolicyPage', () => {
  beforeEach(() => {
    mockGetPodcastName.mockResolvedValue('PPT Não Compila')
  })

  it('renders the title and last-updated date', async () => {
    render(await PrivacyPolicyPage())
    expect(
      screen.getByRole('heading', { level: 1, name: 'Política de Privacidade' })
    ).toBeInTheDocument()
    expect(screen.getByText(/Última atualização:/)).toBeInTheDocument()
  })

  it('renders the core sections', async () => {
    render(await PrivacyPolicyPage())
    expect(screen.getByRole('heading', { name: /Informações que coletamos/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Como usamos as informações/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Seus direitos/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^13\. Contato/ })).toBeInTheDocument()
  })

  it('exposes a contact e-mail and cross-links to terms', async () => {
    render(await PrivacyPolicyPage())
    expect(screen.getByRole('link', { name: /contato@/ })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:')
    )
    expect(screen.getByRole('link', { name: 'Termos de Serviço' })).toHaveAttribute('href', '/terms')
  })

  // O rodapé é do TENANT: com um único podcast, o literal e o configurado eram
  // indistinguíveis — o 2º tenant expôs o nome do PPTNC em seis telas.
  it('shows the configured podcast name in the footer, never another tenant', async () => {
    mockGetPodcastName.mockResolvedValue('TrenDs News')
    render(await PrivacyPolicyPage())
    expect(screen.getByText(/IAra · TrenDs News/)).toBeInTheDocument()
    expect(screen.queryByText(/PPT Não Compila/)).not.toBeInTheDocument()
  })

  it('falls back to a bare "IAra" footer when there is no podcast name', async () => {
    mockGetPodcastName.mockResolvedValue(null)
    render(await PrivacyPolicyPage())
    expect(screen.getByText(/© \d{4} IAra$/)).toBeInTheDocument()
  })
})
