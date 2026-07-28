/**
 * Tests para ManualUploadDropzone — Epic 22 / Story 22.3e.
 *
 * Cobre validação client-side (tipo/tamanho), upload bem-sucedido (file picker),
 * drag-and-drop, e tratamento de erro do endpoint.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'

import { render, screen, waitFor } from '@/test-utils'

import { ManualUploadDropzone } from './manual-upload-dropzone'

vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

const originalFetch = global.fetch
const fetchMock = vi.fn()

function mockUploadResponse(thumbnailUrl: string) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ thumbnailUrl, mimeType: 'image/png' }),
  } as Response)
}

function mockUploadError(status: number, message?: string) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => (message ? { error: { message } } : { error: {} }),
  } as Response)
}

describe('ManualUploadDropzone (Story 22.3e)', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('renders the upload area, drop hint and pick button', () => {
    render(<ManualUploadDropzone videoId="vid-1" onUploaded={() => {}} />)
    expect(screen.getByTestId('path-upload')).toBeInTheDocument()
    expect(screen.getByTestId('dropzone')).toBeInTheDocument()
    expect(screen.getByTestId('upload-input')).toBeInTheDocument()
    expect(screen.getByTestId('upload-pick-button')).toBeEnabled()
  })

  it('uploads a valid file picked through the input and calls onUploaded', async () => {
    mockUploadResponse('/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fpptnc%2Fvid-1%2Fupload-123.png')
    const onUploaded = vi.fn()
    const user = userEvent.setup()
    render(<ManualUploadDropzone videoId="vid-1" onUploaded={onUploaded} />)

    const file = new File(['imagebytes'], 'foto.png', { type: 'image/png' })
    const input = screen.getByTestId('upload-input') as HTMLInputElement
    await user.upload(input, file)

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledTimes(1)
    })
    expect(onUploaded).toHaveBeenCalledWith({
      url: '/api/wizard/thumbnail/upload?path=thumbnail-staging%2Fpptnc%2Fvid-1%2Fupload-123.png',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/wizard/thumbnail/upload')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    const sent = init.body as FormData
    expect(sent.get('videoId')).toBe('vid-1')
    expect(sent.get('file')).toBe(file)
  })

  it('rejects files over 2 MB client-side', async () => {
    const onUploaded = vi.fn()
    const user = userEvent.setup()
    render(<ManualUploadDropzone videoId="vid-1" onUploaded={onUploaded} />)

    const big = new Uint8Array(2 * 1024 * 1024 + 1)
    const file = new File([big], 'big.png', { type: 'image/png' })
    await user.upload(screen.getByTestId('upload-input') as HTMLInputElement, file)

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('upload-error').textContent).toMatch(/Máximo 2 MB/)
    expect(onUploaded).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders the server-side error message when the endpoint fails', async () => {
    mockUploadError(500, 'Servidor indisponível')
    const onUploaded = vi.fn()
    const user = userEvent.setup()
    render(<ManualUploadDropzone videoId="vid-1" onUploaded={onUploaded} />)

    const file = new File(['x'], 'foto.png', { type: 'image/png' })
    await user.upload(screen.getByTestId('upload-input') as HTMLInputElement, file)

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('upload-error').textContent).toMatch(/Servidor indisponível/)
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('handles drag-and-drop of a valid file', async () => {
    mockUploadResponse('/api/wizard/thumbnail/upload?path=x')
    const onUploaded = vi.fn()
    render(<ManualUploadDropzone videoId="vid-1" onUploaded={onUploaded} />)

    const file = new File(['imagebytes'], 'foto.png', { type: 'image/png' })
    const dropzone = screen.getByTestId('dropzone')
    fireEvent.dragOver(dropzone)
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith({ url: '/api/wizard/thumbnail/upload?path=x' })
    })
  })

  it('rejects drag-and-drop of an unsupported file', async () => {
    const onUploaded = vi.fn()
    render(<ManualUploadDropzone videoId="vid-1" onUploaded={onUploaded} />)

    const file = new File(['x'], 'foto.gif', { type: 'image/gif' })
    fireEvent.drop(screen.getByTestId('dropzone'), { dataTransfer: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument()
    })
    expect(onUploaded).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

/**
 * Epic 28 — regressão de rolagem global.
 *
 * O input do arquivo é `sr-only`, ou seja `position: absolute`. Sem um ancestral
 * posicionado o containing block vira o <body>, e um absoluto ancorado no body
 * NÃO é clipado pelo `overflow-auto` do painel do wizard: ele estica o documento
 * até a posição em que estiver, criando barra de rolagem na página inteira.
 *
 * Passou despercebido no Epic 22 porque a fase Thumbnail tem um único dropzone e
 * é curta — o input nunca chegava além da viewport. Na fase Imagens Extras, com
 * três dropzones, o terceiro caía em y=2544 numa viewport de 871 (medido no
 * browser em 2026-07-28).
 */
describe('ManualUploadDropzone — containing block do input (Epic 28)', () => {
  it('mantém o root posicionado para o input sr-only não ancorar no body', () => {
    render(<ManualUploadDropzone videoId="vid1" onUploaded={vi.fn()} />)

    const root = screen.getByTestId('path-upload')
    expect(root.className).toContain('relative')
  })

  it('mantém o input dentro do root posicionado', () => {
    const { container } = render(<ManualUploadDropzone videoId="vid1" onUploaded={vi.fn()} />)

    const root = screen.getByTestId('path-upload')
    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    expect(root.contains(input!)).toBe(true)
  })
})
