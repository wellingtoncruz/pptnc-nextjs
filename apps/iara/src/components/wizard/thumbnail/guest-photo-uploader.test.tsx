/**
 * Tests para GuestPhotoUploader — Epic 22 / Story 22.3f.
 *
 * O componente real abre um modal com `react-image-crop` que precisa de
 * dimensões reais do DOM (jsdom não calcula layout). Em vez de tentar
 * disparar o crop completo no teste, mockamos `react-image-crop` pra um
 * componente trivial que dispara `onComplete` direto com um PixelCrop válido.
 * Isso cobre o fluxo Selecionar → Crop modal abre → Confirmar → upload.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'

import { render, screen, waitFor } from '@/test-utils'

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

// Mock react-image-crop com um stub que renderiza filhos + emite onComplete.
vi.mock('react-image-crop', () => {
  const ReactCrop = ({ children, onComplete }: { children: React.ReactNode; onComplete: (c: { x: number; y: number; width: number; height: number }) => void }) => {
    // Dispara onComplete na próxima tick pra simular o usuário arrastando o crop.
    setTimeout(() => {
      onComplete?.({ x: 0, y: 0, width: 100, height: 100 })
    }, 0)
    return <div data-testid="react-crop-stub">{children}</div>
  }
  return { default: ReactCrop }
})

import { GuestPhotoUploader } from './guest-photo-uploader'

const originalFetch = global.fetch
const fetchMock = vi.fn()

function mockUploadResponse(thumbnailUrl: string) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ thumbnailUrl, mimeType: 'image/png' }),
  } as Response)
}

// jsdom doesn't implement these. Stub them so cropToBlob can produce a Blob.
beforeEach(() => {
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(new Blob(['fake'], { type: 'image/png' }))
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
  })) as unknown as HTMLCanvasElement['getContext']
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => 400,
  })
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get: () => 300,
  })
  Object.defineProperty(HTMLImageElement.prototype, 'width', {
    configurable: true,
    get: () => 400,
  })
  Object.defineProperty(HTMLImageElement.prototype, 'height', {
    configurable: true,
    get: () => 300,
  })
})

/** Helper: define `navigator.clipboard` durante o teste sem disparar o getter readonly. */
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value,
  })
}

describe('GuestPhotoUploader (Story 22.3f)', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders the dropzone, pick button and paste button when no photo is set', () => {
    render(<GuestPhotoUploader videoId="vid-1" onChange={() => {}} />)
    expect(screen.getByTestId('guest-photo-uploader')).toBeInTheDocument()
    expect(screen.getByTestId('guest-photo-dropzone')).toBeInTheDocument()
    expect(screen.getByTestId('guest-photo-pick')).toBeInTheDocument()
    expect(screen.getByTestId('guest-photo-paste')).toBeInTheDocument()
  })

  it('renders the preview + replace/remove buttons when a photo is set', () => {
    render(
      <GuestPhotoUploader
        videoId="vid-1"
        currentUrl="/api/wizard/thumbnail/upload?path=guest.png"
        onChange={() => {}}
      />
    )
    expect(screen.getByTestId('guest-photo-preview')).toBeInTheDocument()
    expect(screen.getByTestId('guest-photo-replace')).toBeInTheDocument()
    expect(screen.getByTestId('guest-photo-remove')).toBeInTheDocument()
    expect(screen.queryByTestId('guest-photo-dropzone')).toBeNull()
  })

  it('calls onChange(null) when the remove button is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <GuestPhotoUploader
        videoId="vid-1"
        currentUrl="/api/wizard/thumbnail/upload?path=guest.png"
        onChange={onChange}
      />
    )
    await user.click(screen.getByTestId('guest-photo-remove'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('rejects unsupported file types via drag-and-drop', async () => {
    const onChange = vi.fn()
    render(<GuestPhotoUploader videoId="vid-1" onChange={onChange} />)

    const file = new File(['x'], 'guest.gif', { type: 'image/gif' })
    fireEvent.drop(screen.getByTestId('guest-photo-dropzone'), {
      dataTransfer: { files: [file] },
    })

    await waitFor(() => {
      expect(screen.getByTestId('guest-photo-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('guest-photo-error').textContent).toMatch(/PNG, JPEG ou WebP/)
    expect(onChange).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects files larger than 5 MB', async () => {
    const onChange = vi.fn()
    render(<GuestPhotoUploader videoId="vid-1" onChange={onChange} />)

    const big = new Uint8Array(5 * 1024 * 1024 + 1)
    const file = new File([big], 'big.png', { type: 'image/png' })
    fireEvent.drop(screen.getByTestId('guest-photo-dropzone'), {
      dataTransfer: { files: [file] },
    })

    await waitFor(() => {
      expect(screen.getByTestId('guest-photo-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('guest-photo-error').textContent).toMatch(/Máximo 5 MB/)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('opens the crop modal when a valid file is dropped', async () => {
    const onChange = vi.fn()
    render(<GuestPhotoUploader videoId="vid-1" onChange={onChange} />)

    const file = new File(['imagebytes'], 'foto.png', { type: 'image/png' })
    fireEvent.drop(screen.getByTestId('guest-photo-dropzone'), {
      dataTransfer: { files: [file] },
    })

    await waitFor(() => {
      expect(screen.getByTestId('guest-photo-crop-modal')).toBeInTheDocument()
    })
    expect(screen.getByTestId('guest-photo-crop-confirm')).toBeInTheDocument()
    expect(screen.getByTestId('guest-photo-crop-cancel')).toBeInTheDocument()
  })

  it('cancels the crop without changing state', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<GuestPhotoUploader videoId="vid-1" onChange={onChange} />)

    const file = new File(['x'], 'foto.png', { type: 'image/png' })
    fireEvent.drop(screen.getByTestId('guest-photo-dropzone'), {
      dataTransfer: { files: [file] },
    })

    await waitFor(() => {
      expect(screen.getByTestId('guest-photo-crop-modal')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('guest-photo-crop-cancel'))

    await waitFor(() => {
      expect(screen.queryByTestId('guest-photo-crop-modal')).toBeNull()
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('confirms the crop, uploads with role=guest and calls onChange with the URL', async () => {
    mockUploadResponse('/api/wizard/thumbnail/upload?path=guest.png')
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<GuestPhotoUploader videoId="vid-1" onChange={onChange} />)

    const file = new File(['imagebytes'], 'foto.png', { type: 'image/png' })
    fireEvent.drop(screen.getByTestId('guest-photo-dropzone'), {
      dataTransfer: { files: [file] },
    })

    // Wait for the mocked ReactCrop to fire onComplete (setTimeout 0).
    await waitFor(() => {
      const btn = screen.getByTestId('guest-photo-crop-confirm') as HTMLButtonElement
      expect(btn.disabled).toBe(false)
    })

    await user.click(screen.getByTestId('guest-photo-crop-confirm'))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('/api/wizard/thumbnail/upload?path=guest.png')
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/wizard/thumbnail/upload')
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    expect(form.get('videoId')).toBe('vid-1')
    expect(form.get('role')).toBe('guest')
    expect(form.get('file')).toBeInstanceOf(File)
  })

  it('pastes from clipboard when the Colar button is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    const pngBlob = new Blob(['fake'], { type: 'image/png' })
    const item = {
      types: ['image/png'],
      getType: vi.fn().mockResolvedValue(pngBlob),
    }
    const readMock = vi.fn().mockResolvedValue([item])
    setClipboard({ read: readMock })

    render(<GuestPhotoUploader videoId="vid-1" onChange={onChange} />)
    await user.click(screen.getByTestId('guest-photo-paste'))

    await waitFor(() => {
      expect(screen.getByTestId('guest-photo-crop-modal')).toBeInTheDocument()
    })
    expect(readMock).toHaveBeenCalled()
    expect(item.getType).toHaveBeenCalledWith('image/png')
  })

  it('shows an error when clipboard has no image', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    const item = { types: ['text/plain'], getType: vi.fn() }
    setClipboard({ read: vi.fn().mockResolvedValue([item]) })

    render(<GuestPhotoUploader videoId="vid-1" onChange={onChange} />)
    await user.click(screen.getByTestId('guest-photo-paste'))

    await waitFor(() => {
      expect(screen.getByTestId('guest-photo-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('guest-photo-error').textContent).toMatch(/Nenhuma imagem/)
  })

  it('shows an error when clipboard.read throws (permission denied)', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    setClipboard({ read: vi.fn().mockRejectedValue(new Error('NotAllowedError')) })

    render(<GuestPhotoUploader videoId="vid-1" onChange={onChange} />)
    await user.click(screen.getByTestId('guest-photo-paste'))

    await waitFor(() => {
      expect(screen.getByTestId('guest-photo-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('guest-photo-error').textContent).toMatch(/área de transferência/)
  })

  it('surfaces server-side errors during upload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Servidor com problema' } }),
    } as Response)
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<GuestPhotoUploader videoId="vid-1" onChange={onChange} />)

    const file = new File(['imagebytes'], 'foto.png', { type: 'image/png' })
    fireEvent.drop(screen.getByTestId('guest-photo-dropzone'), {
      dataTransfer: { files: [file] },
    })

    await waitFor(() => {
      const btn = screen.getByTestId('guest-photo-crop-confirm') as HTMLButtonElement
      expect(btn.disabled).toBe(false)
    })
    await user.click(screen.getByTestId('guest-photo-crop-confirm'))

    await waitFor(() => {
      expect(screen.getByTestId('guest-photo-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('guest-photo-error').textContent).toMatch(/Servidor com problema/)
    expect(onChange).not.toHaveBeenCalled()
  })
})
