import { act, render, screen, fireEvent } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { AdwordsKeywordsDisplay } from './adwords-keywords-display'

const mockWriteText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  })
  mockWriteText.mockClear()
})

describe('AdwordsKeywordsDisplay', () => {
  it('renderiza keywords como Badge pills', () => {
    const keywords = ['marketing digital', 'podcast', 'SEO']

    render(<AdwordsKeywordsDisplay keywords={keywords} />)

    expect(screen.getByText('marketing digital')).toBeInTheDocument()
    expect(screen.getByText('podcast')).toBeInTheDocument()
    expect(screen.getByText('SEO')).toBeInTheDocument()
  })

  it('exibe título "Keywords" com botão copiar', () => {
    render(<AdwordsKeywordsDisplay keywords={['kw1']} />)

    expect(screen.getByText('Keywords')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar keywords' })).toBeInTheDocument()
  })

  it('copia keywords separadas por newline ao clicar no botão', async () => {
    const keywords = ['keyword1', 'keyword2', 'keyword3']

    render(<AdwordsKeywordsDisplay keywords={keywords} />)

    await userEvent.click(screen.getByRole('button', { name: 'Copiar keywords' }))

    expect(mockWriteText).toHaveBeenCalledWith('keyword1\nkeyword2\nkeyword3')
  })

  it('feedback: ícone muda para Check por 2 segundos após copiar', async () => {
    vi.useFakeTimers()

    render(<AdwordsKeywordsDisplay keywords={['kw1']} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar keywords' }))
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'Copiado' })).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(screen.getByRole('button', { name: 'Copiar keywords' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('renderiza container com flex-wrap para layout de pills', () => {
    render(<AdwordsKeywordsDisplay keywords={['kw1', 'kw2']} />)

    const container = screen.getByTestId('adwords-keywords-container')
    expect(container).toHaveClass('flex', 'flex-wrap', 'gap-2')
  })
})
