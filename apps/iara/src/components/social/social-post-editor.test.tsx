import { act, render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import type { SocialPost } from '@/types/social'

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
}))

import { SocialPostEditor } from './social-post-editor'
import { parseHashtags } from './parse-hashtags'

const mockPost: SocialPost = {
  networkId: 'instagram',
  cta: 'Confira o novo episódio!',
  body: 'Neste episódio falamos sobre React 19.',
  hashtags: ['#react', '#javascript'],
  updatedAt: '2026-02-24T00:00:00Z',
  processedBy: 'llm',
}

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ data: { networkId: 'instagram' } }),
})

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  global.fetch = mockFetch
  mockFetch.mockClear()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SocialPostEditor', () => {
  it('renders CTA, body, hashtags from post', () => {
    render(
      <SocialPostEditor videoId="v1" networkId="instagram" post={mockPost} onPostUpdated={vi.fn()} />
    )

    expect(screen.getByDisplayValue('Confira o novo episódio!')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Neste episódio falamos sobre React 19.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('#react #javascript')).toBeInTheDocument()
  })

  it('auto-saves after 1.5s debounce on CTA change', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <SocialPostEditor videoId="v1" networkId="instagram" post={mockPost} onPostUpdated={vi.fn()} />
    )

    const ctaInput = screen.getByDisplayValue('Confira o novo episódio!')
    await user.clear(ctaInput)
    await user.type(ctaInput, 'Novo CTA')
    expect(mockFetch).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/v1/social-posts/instagram',
      expect.objectContaining({ method: 'PUT' })
    )
  })

  it('auto-saves after 1.5s debounce on body change', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <SocialPostEditor videoId="v1" networkId="instagram" post={mockPost} onPostUpdated={vi.fn()} />
    )

    const bodyTextarea = screen.getByDisplayValue('Neste episódio falamos sobre React 19.')
    await user.clear(bodyTextarea)
    await user.type(bodyTextarea, 'Novo body')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/videos/v1/social-posts/instagram',
      expect.objectContaining({ method: 'PUT' })
    )
  })

  it('shows SaveStatusIndicator during save cycle', async () => {
    let resolveSave: () => void
    mockFetch.mockImplementation(
      () => new Promise<Response>(resolve => {
        resolveSave = () => resolve({ ok: true, json: () => Promise.resolve({ data: {} }) } as Response)
      })
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <SocialPostEditor videoId="v1" networkId="instagram" post={mockPost} onPostUpdated={vi.fn()} />
    )

    const ctaInput = screen.getByDisplayValue('Confira o novo episódio!')
    await user.type(ctaInput, 'X')

    // Pending state
    expect(screen.getByText('Alterações pendentes...')).toBeInTheDocument()

    // Trigger debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(screen.getByText('Salvando...')).toBeInTheDocument()

    // Complete save
    await act(async () => {
      resolveSave!()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('Salvo')).toBeInTheDocument()
  })

  it('calls onPostUpdated after successful save', async () => {
    const onPostUpdated = vi.fn()
    let resolveSave: () => void
    mockFetch.mockImplementation(
      () => new Promise<Response>(resolve => {
        resolveSave = () => resolve({
          ok: true,
          json: () => Promise.resolve({ data: { networkId: 'instagram' } }),
        } as Response)
      })
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <SocialPostEditor videoId="v1" networkId="instagram" post={mockPost} onPostUpdated={onPostUpdated} />
    )

    const ctaInput = screen.getByDisplayValue('Confira o novo episódio!')
    await user.type(ctaInput, 'X')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(mockFetch).toHaveBeenCalled()

    await act(async () => {
      resolveSave!()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(onPostUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        cta: 'Confira o novo episódio!X',
        processedBy: 'manual',
      })
    )
  })

  it('renders CopyButton for each field', () => {
    render(
      <SocialPostEditor videoId="v1" networkId="instagram" post={mockPost} onPostUpdated={vi.fn()} />
    )

    expect(screen.getByRole('button', { name: /copiar cta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copiar corpo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copiar hashtags/i })).toBeInTheDocument()
  })
})

describe('parseHashtags', () => {
  it.each([
    ['#ai #podcast', ['#ai', '#podcast']],
    ['ai, podcast tech', ['#ai', '#podcast', '#tech']],
    ['#AI #ai #Ai', ['#AI']],
    ['  ', []],
    ['', []],
    ['#hello,,  #world  ', ['#hello', '#world']],
  ])('parseHashtags("%s") => %j', (input, expected) => {
    expect(parseHashtags(input)).toEqual(expected)
  })
})
