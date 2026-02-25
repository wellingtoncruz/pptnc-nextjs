import { act, render, screen, fireEvent, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { CopyButton } from './copy-button'

const mockWriteText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  })
  mockWriteText.mockClear()
})

describe('CopyButton', () => {
  it('copies text to clipboard on click', async () => {
    render(<CopyButton text="Hello World" />)

    await userEvent.click(screen.getByRole('button', { name: /copiar texto/i }))
    expect(mockWriteText).toHaveBeenCalledWith('Hello World')
  })

  it('shows Check icon after copy', async () => {
    render(<CopyButton text="test" label="CTA" />)

    await userEvent.click(screen.getByRole('button', { name: /copiar cta/i }))
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeInTheDocument()
  })

  it('resets to Copy icon after timeout', async () => {
    vi.useFakeTimers()
    render(<CopyButton text="test" label="CTA" />)

    // Use fireEvent to avoid userEvent internal timer conflicts
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copiar cta/i }))
      // Let the async handleCopy resolve
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(screen.getByRole('button', { name: /copiar cta/i })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('handles clipboard error gracefully', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('Not allowed'))
    render(<CopyButton text="test" />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copiar texto/i }))
      // Let the async handleCopy with rejected promise settle
      await Promise.resolve()
      await Promise.resolve()
    })
    // Should not crash, button still present with original label (not "Copiado")
    expect(screen.getByRole('button', { name: /copiar texto/i })).toBeInTheDocument()
  })
})
