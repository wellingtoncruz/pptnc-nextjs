'use client'

import { useCallback, useRef, useState } from 'react'
import { AlertTriangleIcon, Loader2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { log } from '@/lib/logger'

const ACCEPTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.webp'

/** 2 MB — limite do YouTube `thumbnails.set`. Mesmo limite do endpoint. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

interface ManualUploadDropzoneProps {
  videoId: string
  /** Disparado quando o upload conclui com sucesso. URL retornada já é o proxy autenticado. */
  onUploaded: (payload: { url: string }) => void
  className?: string
}

/**
 * Caminho 2 — Upload manual de thumbnail (Epic 22 / Story 22.3e).
 *
 * Aceita drag-and-drop OU file picker. Valida tipo (PNG/JPEG/WebP) e tamanho
 * (≤ 2 MB) client-side antes de enviar — limites espelham os do YouTube
 * `thumbnails.set`. O endpoint valida tudo de novo no servidor.
 *
 * Em sucesso, dispara `onUploaded` com a URL do proxy autenticado. O pai
 * adiciona a versão à galeria e marca como selecionada automaticamente.
 *
 * Drag-and-drop é nativo (HTML5) — não pula em dependência externa. O input
 * file fica escondido e é acionado pelo botão "Selecionar arquivo" para
 * preservar acessibilidade via teclado.
 */
export function ManualUploadDropzone({ videoId, onUploaded, className }: ManualUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validateFile = useCallback((file: { type: string; size: number }): string | null => {
    if (!ACCEPTED_MIME_TYPES.has(file.type)) {
      return 'Formato inválido. Use PNG, JPEG ou WebP.'
    }
    if (file.size === 0) {
      return 'Arquivo vazio.'
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return 'Imagem muito grande. Máximo 2 MB.'
    }
    return null
  }, [])

  const performUpload = useCallback(
    async (file: File) => {
      setError(null)
      setIsUploading(true)
      try {
        const validationError = validateFile(file)
        if (validationError) {
          setError(validationError)
          return
        }
        const form = new FormData()
        form.append('videoId', videoId)
        form.append('file', file)

        const response = await fetch('/api/wizard/thumbnail/upload', {
          method: 'POST',
          body: form,
        })

        if (!response.ok) {
          let message = 'Falha no upload. Tente novamente.'
          try {
            const payload = await response.json()
            if (payload?.error?.message) message = payload.error.message
          } catch {
            // ignore parse error, keep default message
          }
          setError(message)
          log('WARN', 'Manual thumbnail upload failed', {
            videoId,
            status: response.status,
            fileType: file.type,
            fileSize: file.size,
          })
          return
        }
        const data = (await response.json()) as { thumbnailUrl?: string }
        if (!data?.thumbnailUrl) {
          setError('Resposta inválida do servidor. Tente novamente.')
          return
        }
        onUploaded({ url: data.thumbnailUrl })
        log('INFO', 'Manual thumbnail upload succeeded', { videoId, fileType: file.type, fileSize: file.size })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro inesperado.'
        setError(`Erro inesperado: ${message}`)
        log('WARN', 'Manual thumbnail upload threw', {
          videoId,
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setIsUploading(false)
      }
    },
    [onUploaded, validateFile, videoId]
  )

  const handlePick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      await performUpload(file)
      // Reset so a subsequent pick of the same file still triggers change.
      if (inputRef.current) inputRef.current.value = ''
    },
    [performUpload]
  )

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragOver(false)
      if (isUploading) return
      const file = event.dataTransfer.files?.[0]
      if (!file) return
      await performUpload(file)
    },
    [isUploading, performUpload]
  )

  return (
    // `relative` existe por um motivo específico: o input do arquivo é `sr-only`,
    // que é `position: absolute`. Sem um ancestral posicionado, o containing
    // block dele vira o <body> — e um absoluto ancorado no body NÃO é clipado
    // pelo `overflow-auto` do painel do wizard. O input então estica o
    // documento até a posição em que estiver, criando uma barra de rolagem
    // global (Epic 28, homologação de 2026-07-28: a fase Imagens Extras tem
    // três dropzones e o terceiro caía em y=2544 numa viewport de 871).
    // Com `relative`, o input fica ancorado aqui dentro e é clipado normalmente.
    <div
      className={cn('relative rounded-md border p-4 flex flex-col gap-3', className)}
      data-testid="path-upload"
    >
      <div className="flex items-center gap-2 font-medium">
        <Upload className="h-4 w-4" />
        Upload próprio
      </div>
      <p className="text-sm text-muted-foreground">
        Já tem uma thumbnail pronta? Arraste o arquivo aqui ou selecione do seu computador (PNG, JPEG ou WebP — máx. 2 MB).
      </p>

      <div
        data-testid="dropzone"
        onDragOver={(e) => {
          e.preventDefault()
          if (!isUploading) setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-6 px-4 transition-colors',
          isDragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
        )}
        aria-label="Área para soltar a imagem ou clicar em selecionar arquivo"
      >
        <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          {isDragOver ? 'Solte a imagem aqui' : 'Arraste a imagem ou'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="sr-only"
          onChange={handleInputChange}
          disabled={isUploading}
          data-testid="upload-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePick}
          disabled={isUploading}
          data-testid="upload-pick-button"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enviando...
            </>
          ) : (
            'Selecionar arquivo'
          )}
        </Button>
      </div>

      {error && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive"
          data-testid="upload-error"
        >
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
