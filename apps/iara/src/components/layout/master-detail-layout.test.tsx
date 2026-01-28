import { render, screen } from '@/test-utils'

import { MasterDetailLayout } from './master-detail-layout'

// Mock react-resizable-panels
vi.mock('react-resizable-panels', () => ({
  Group: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="resizable-group" {...props}>{children}</div>
  ),
  Panel: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
  Separator: ({ children }: React.PropsWithChildren) => (
    <div data-testid="resizable-handle">{children}</div>
  ),
}))

describe('MasterDetailLayout', () => {
  const defaultProps = {
    sidebar: <div data-testid="sidebar-content">Sidebar</div>,
    list: <div data-testid="list-content">List</div>,
    detail: <div data-testid="detail-content">Detail</div>,
  }

  it('renderiza os três painéis corretamente', () => {
    render(<MasterDetailLayout {...defaultProps} />)

    expect(screen.getByTestId('sidebar-panel')).toBeInTheDocument()
    expect(screen.getByTestId('video-list-panel')).toBeInTheDocument()
    expect(screen.getByTestId('video-detail-panel')).toBeInTheDocument()
  })

  it('renderiza o conteúdo passado para cada painel', () => {
    render(<MasterDetailLayout {...defaultProps} />)

    expect(screen.getByTestId('sidebar-content')).toBeInTheDocument()
    expect(screen.getByTestId('list-content')).toBeInTheDocument()
    expect(screen.getByTestId('detail-content')).toBeInTheDocument()
  })

  it('usa direção horizontal para os painéis', () => {
    render(<MasterDetailLayout {...defaultProps} />)

    const group = screen.getByTestId('resizable-group')
    expect(group).toHaveAttribute('orientation', 'horizontal')
  })

  it('renderiza handle entre lista e detalhes', () => {
    render(<MasterDetailLayout {...defaultProps} />)

    const handles = screen.getAllByTestId('resizable-handle')
    expect(handles).toHaveLength(1)
  })
})
