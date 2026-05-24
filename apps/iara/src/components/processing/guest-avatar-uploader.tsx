'use client'

import { useCallback, useRef, useState } from 'react'
import { Clipboard, Loader2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

interface GuestAvatarUploaderProps {
  /** LinkedIn URL is the stable key used by the backend to derive guestKey. */
  linkedinUrl: string
  /** Fires with the proxy URL when the upload succeeds. */
  onUploaded: (proxyUrl: string) => void
  className?: string
}

/**
 * Inline avatar uploader shown in PersonForm when the scrape didn't return a
 * photo (Story 24.7 polish). Three input paths:
 *
 *  - file picker (button "Adicionar foto")
 *  - drag-and-drop onto the area
 *  - clipboard paste via the explicit "Colar" button (uses
 *    `navigator.clipboard.read()`, which requires a user gesture and a
 *    permission grant — see Story 22.3f for the same pattern)
 *
 * Posts to `/api/guests/avatar/upload` which stores under the same
 * `guest-avatars/{podcastId}/{guestKey}-{ts}.ext` convention as the scrape
 * path, so the `/api/guests/[guestKey]/avatar` proxy resolves both flavors
 * transparently.
 */
export function GuestAvatarUploader({ linkedinUrl, onUploaded, className }: GuestAvatarUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitFile = useCallback(
    async (file: File) => {
      setError(null)
      if (file.type && !ACCEPTED_MIME.has(file.type)) {
        setError('Formato inválido. Use PNG, JPEG ou WebP.')
        return
      }
      if (file.size === 0) {
        setError('Arquivo vazio.')
        return
      }
      if (file.size > MAX_BYTES) {
        setError('Arquivo maior que 2 MB.')
        return
      }

      setUploading(true)
      try {
        const fd = new FormData()
        fd.append('linkedinUrl', linkedinUrl)
        fd.append('file', file)
        const response = await fetch('/api/guests/avatar/upload', {
          method: 'POST',
          body: fd,
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.data?.proxyUrl) {
          throw new Error(payload?.error?.message ?? 'Falha no upload')
        }
        onUploaded(payload.data.proxyUrl)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro no upload')
      } finally {
        setUploading(false)
      }
    },
    [linkedinUrl, onUploaded]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) submitFile(file)
      // Reset so the same file can be picked again after a failure.
      e.target.value = ''
    },
    [submitFile]
  )

  /**
   * Explicit clipboard read — uses the async Clipboard API which requires a
   * user gesture. Same pattern as Story 22.3f (guest-photo-uploader). The
   * previous version used `onPaste` on a div, which only fires when the
   * element is focused — invisible to the producer.
   */
  const handlePasteClick = useCallback(async () => {
    setError(null)
    try {
      const clipboard = (navigator as Navigator).clipboard as Clipboard | undefined
      if (!clipboard || typeof clipboard.read !== 'function') {
        setError(
          'Seu navegador não suporta colar da área de transferência. Use o seletor de arquivo ou arraste.'
        )
        return
      }
      const items = await clipboard.read()
      for (const item of items) {
        const imageType = item.types.find(
          (t) => t.startsWith('image/') && ACCEPTED_MIME.has(t)
        )
        if (!imageType) continue
        const blob = await item.getType(imageType)
        const ext = imageType.split('/')[1] ?? 'png'
        const file = new File([blob], `colado.${ext}`, { type: imageType })
        submitFile(file)
        return
      }
      setError('Nenhuma imagem encontrada na área de transferência.')
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('denied')
          ? 'Permissão negada. Permita o acesso à área de transferência.'
          : 'Não foi possível ler a área de transferência.'
      )
    }
  }, [submitFile])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file && file.type.startsWith('image/')) submitFile(file)
    },
    [submitFile]
  )

  if (!linkedinUrl?.trim()) return null

  return (
    <div
      className={cn('inline-flex flex-col gap-1', className)}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Selecionar foto do convidado"
      />
      <div className="inline-flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="h-9 px-2 text-xs"
          title="Selecionar arquivo ou arrastar uma imagem"
        >
          {uploading ? (
            <>
              <Loader2 className="size-3 mr-1 animate-spin" /> Enviando...
            </>
          ) : (
            <>
              <Upload className="size-3 mr-1" /> Adicionar foto
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={handlePasteClick}
          className="h-9 px-2 text-xs"
          title="Colar imagem da área de transferência"
          aria-label="Colar imagem da área de transferência"
        >
          <Clipboard className="size-3" />
        </Button>
      </div>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
