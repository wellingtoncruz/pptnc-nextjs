'use client'

import { useCallback, useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'

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
 * photo (Story 24.7 polish). Accepts file picker, drag-and-drop and clipboard
 * paste — no crop step, the avatar is used as-is.
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
      if (!ACCEPTED_MIME.has(file.type) && file.type !== '') {
        // Empty type happens with clipboard paste; backend tolerates it.
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

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            submitFile(file)
            return
          }
        }
      }
    },
    [submitFile]
  )

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
      onPaste={handlePaste}
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
        className="h-9 px-2 text-xs"
        title="Clique pra selecionar, ou cole/arraste uma imagem"
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
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
