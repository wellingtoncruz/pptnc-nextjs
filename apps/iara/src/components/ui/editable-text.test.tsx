import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'

import { EditableText } from './editable-text'

describe('EditableText', () => {
  const mockOnSave = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders value in normal state', () => {
    render(<EditableText value="Test value" onSave={mockOnSave} />)
    expect(screen.getByText('Test value')).toBeInTheDocument()
  })

  it('renders placeholder when value is empty', () => {
    render(<EditableText value="" onSave={mockOnSave} placeholder="Click to edit" />)
    expect(screen.getByText('Click to edit')).toBeInTheDocument()
  })

  it('switches to edit mode on click', async () => {
    const user = userEvent.setup()
    render(<EditableText value="Test value" onSave={mockOnSave} />)

    await user.click(screen.getByText('Test value'))

    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('Test value')
  })

  it('switches to edit mode on Enter key', async () => {
    const user = userEvent.setup()
    render(<EditableText value="Test value" onSave={mockOnSave} />)

    const text = screen.getByText('Test value')
    text.focus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('saves on Enter key', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)

    render(<EditableText value="Original" onSave={mockOnSave} />)

    await user.click(screen.getByText('Original'))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'New value')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith('New value')
    })
  })

  it('cancels on Escape key', async () => {
    const user = userEvent.setup()
    render(<EditableText value="Original" onSave={mockOnSave} />)

    await user.click(screen.getByText('Original'))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'New value')
    await user.keyboard('{Escape}')

    // Should return to normal state with original value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('Original')).toBeInTheDocument()
    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('does not save if value is unchanged', async () => {
    const user = userEvent.setup()
    render(<EditableText value="Original" onSave={mockOnSave} />)

    await user.click(screen.getByText('Original'))
    await user.keyboard('{Enter}')

    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('does not save if value is empty', async () => {
    const user = userEvent.setup()
    render(<EditableText value="Original" onSave={mockOnSave} />)

    await user.click(screen.getByText('Original'))
    await user.clear(screen.getByRole('textbox'))
    await user.keyboard('{Enter}')

    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('shows spinner while saving', async () => {
    const user = userEvent.setup()
    // Never resolve to keep in saving state
    mockOnSave.mockImplementation(() => new Promise(() => {}))

    render(<EditableText value="Original" onSave={mockOnSave} />)

    await user.click(screen.getByText('Original'))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'New value')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDisabled()
    })
  })

  it('shows saved state after successful save', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)

    render(<EditableText value="Original" onSave={mockOnSave} />)

    await user.click(screen.getByText('Original'))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'New value')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      // Should return to display mode (no input)
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      // Save callback should have been called
      expect(mockOnSave).toHaveBeenCalledWith('New value')
    })
  })

  it('reverts to original value on save error', async () => {
    const user = userEvent.setup()
    mockOnSave.mockRejectedValue(new Error('Save failed'))

    render(<EditableText value="Original" onSave={mockOnSave} />)

    await user.click(screen.getByText('Original'))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'New value')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(screen.getByText('Original')).toBeInTheDocument()
    })
  })

  it('does not enter edit mode when disabled', async () => {
    const user = userEvent.setup()
    render(<EditableText value="Test value" onSave={mockOnSave} disabled />)

    await user.click(screen.getByText('Test value'))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
