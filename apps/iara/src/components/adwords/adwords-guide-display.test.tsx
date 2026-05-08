import { describe, expect, it } from 'vitest'

import { render, screen } from '@/test-utils'

import { AdwordsGuideDisplay } from './adwords-guide-display'

describe('AdwordsGuideDisplay', () => {
  it('renderiza markdown como HTML formatado', () => {
    const guide = '# Guia AdWords\n\nConteúdo do guia com **negrito**'

    render(<AdwordsGuideDisplay guide={guide} />)

    expect(screen.getByTestId('adwords-guide-display')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Guia AdWords')
    expect(screen.getByText('negrito').tagName).toBe('STRONG')
  })

  it('renderiza listas como elementos HTML semânticos', () => {
    const guide = '- Item 1\n- Item 2\n- Item 3'

    render(<AdwordsGuideDisplay guide={guide} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Item 1')
  })

  it('renderiza headers h2 e h3 corretamente', () => {
    const guide = '## Seção Principal\n\n### Subseção'

    render(<AdwordsGuideDisplay guide={guide} />)

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Seção Principal')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Subseção')
  })

  it('tem scroll vertical quando conteúdo excede área', () => {
    render(<AdwordsGuideDisplay guide="conteúdo" />)

    const element = screen.getByTestId('adwords-guide-display')
    expect(element).toHaveClass('overflow-y-auto')
  })

  it('mantém data-testid no container', () => {
    render(<AdwordsGuideDisplay guide="test" />)

    expect(screen.getByTestId('adwords-guide-display')).toBeInTheDocument()
  })

  it('renderiza sem crash com guide vazio', () => {
    render(<AdwordsGuideDisplay guide="" />)

    const container = screen.getByTestId('adwords-guide-display')
    expect(container).toBeInTheDocument()
    expect(container.textContent).toBe('')
  })
})
