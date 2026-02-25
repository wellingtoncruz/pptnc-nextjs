import { describe, expect, it, vi, beforeEach } from 'vitest'

import { act, render, screen, waitFor } from '@/test-utils'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { SocialNetworksSettingsForm } from './social-networks-settings-form'

const mockNetworks = [
  { id: 'instagram', name: 'Instagram', icon: '📷' },
  { id: 'twitter', name: 'X (Twitter)', icon: '🐦' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
]

describe('SocialNetworksSettingsForm', () => {
  const mockOnSave = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnSave.mockResolvedValue(undefined)
  })

  it('renders all networks with toggles unchecked when none enabled', () => {
    render(
      <SocialNetworksSettingsForm
        socialNetworks={mockNetworks}
        enabledNetworks={[]}
        onSave={mockOnSave}
      />
    )

    expect(screen.getByLabelText('📷 Instagram')).toHaveAttribute('data-state', 'unchecked')
    expect(screen.getByLabelText('🐦 X (Twitter)')).toHaveAttribute('data-state', 'unchecked')
    expect(screen.getByLabelText('💼 LinkedIn')).toHaveAttribute('data-state', 'unchecked')
  })

  it('renders enabled networks as checked', () => {
    render(
      <SocialNetworksSettingsForm
        socialNetworks={mockNetworks}
        enabledNetworks={['instagram']}
        onSave={mockOnSave}
      />
    )

    expect(screen.getByLabelText('📷 Instagram')).toHaveAttribute('data-state', 'checked')
    expect(screen.getByLabelText('🐦 X (Twitter)')).toHaveAttribute('data-state', 'unchecked')
  })

  it('calls onSave with updated array when enabling a network', async () => {
    render(
      <SocialNetworksSettingsForm
        socialNetworks={mockNetworks}
        enabledNetworks={['instagram']}
        onSave={mockOnSave}
      />
    )

    const twitterSwitch = screen.getByLabelText('🐦 X (Twitter)')
    await act(async () => {
      twitterSwitch.click()
    })

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(['instagram', 'twitter'])
    })
  })

  it('calls onSave with updated array when disabling a network', async () => {
    render(
      <SocialNetworksSettingsForm
        socialNetworks={mockNetworks}
        enabledNetworks={['instagram', 'twitter']}
        onSave={mockOnSave}
      />
    )

    const instagramSwitch = screen.getByLabelText('📷 Instagram')
    await act(async () => {
      instagramSwitch.click()
    })

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(['twitter'])
    })
  })

  it('reverts toggle on save error', async () => {
    mockOnSave.mockRejectedValue(new Error('Server error'))

    render(
      <SocialNetworksSettingsForm
        socialNetworks={mockNetworks}
        enabledNetworks={[]}
        onSave={mockOnSave}
      />
    )

    const instagramSwitch = screen.getByLabelText('📷 Instagram')
    await act(async () => {
      instagramSwitch.click()
    })

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })

    // Should revert to unchecked
    expect(instagramSwitch).toHaveAttribute('data-state', 'unchecked')
  })

  it('shows empty state message when no networks available', () => {
    render(
      <SocialNetworksSettingsForm
        socialNetworks={[]}
        enabledNetworks={[]}
        onSave={mockOnSave}
      />
    )

    expect(screen.getByText('Nenhuma rede social disponível no catálogo.')).toBeInTheDocument()
  })

  it('shows saving indicator while save is in progress', async () => {
    let resolvePromise: () => void
    mockOnSave.mockReturnValue(new Promise<void>((resolve) => { resolvePromise = resolve }))

    render(
      <SocialNetworksSettingsForm
        socialNetworks={mockNetworks}
        enabledNetworks={[]}
        onSave={mockOnSave}
      />
    )

    const instagramSwitch = screen.getByLabelText('📷 Instagram')
    await act(async () => {
      instagramSwitch.click()
    })

    expect(screen.getByText('Salvando...')).toBeInTheDocument()

    await act(async () => {
      resolvePromise!()
    })

    expect(screen.queryByText('Salvando...')).not.toBeInTheDocument()
  })

  it('shows description text', () => {
    render(
      <SocialNetworksSettingsForm
        socialNetworks={mockNetworks}
        enabledNetworks={[]}
        onSave={mockOnSave}
      />
    )

    expect(screen.getByText('Selecione as redes sociais para as quais deseja gerar posts.')).toBeInTheDocument()
  })
})
