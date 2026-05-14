'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { AlertTriangleIcon, Clipboard, Loader2, Trash2, Upload, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { log } from '@/lib/logger'

const ACCEPTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** 5 MB — espaço pra fotos de celular antes do crop. O endpoint duplica essa checagem. */
const MAX_INPUT_BYTES = 5 * 1024 * 1024

interface GuestPhotoUploaderProps {
  videoId: string
  /** URL atual da foto do convidado (após upload+crop). `undefined` = sem foto. */
  currentUrl?: string
  /** Disparado quando a URL muda: `string` = nova foto, `null` = removida. */
  onChange: (url: string | null) => void
  className?: string
}

/**
 * Caminho 1 — Foto do convidado para cortes (Epic 22 / Story 22.3f).
 *
 * Entradas suportadas: file picker, drag-and-drop e paste da área de
 * transferência (`navigator.clipboard.read()`). Após o arquivo entrar, um
 * Dialog abre com `react-image-crop` em aspect-ratio livre — o produtor
 * escolhe o enquadramento e confirma. O crop é aplicado client-side num
 * canvas e o PNG resultante é enviado pra `/api/wizard/thumbnail/upload`
 * com `role=guest` (vai pra `thumbnail-staging/.../guest-{ts}.png`).
 *
 * A URL retornada fica no estado do pai e, na Story 22.4, será incluída
 * no body do `POST /api/wizard/thumbnail/generate` como reference image
 * extra para a chamada ao LLM. Por enquanto, o stub apenas registra que
 * existe.
 *
 * Componente renderizado apenas pra `videoType === 'cut'` — caller é
 * responsável por gatear.
 */
export function GuestPhotoUploader({ videoId, currentUrl, onChange, className }: GuestPhotoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)

  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null)
  const [sourceMimeType, setSourceMimeType] = useState<string>('image/png')
  const [crop, setCrop] = useState<Crop | undefined>(undefined)
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Revoke object URL so we don't leak memory between picks.
  useEffect(() => {
    return () => {
      if (sourceImageUrl?.startsWith('blob:')) URL.revokeObjectURL(sourceImageUrl)
    }
  }, [sourceImageUrl])

  const validateInputFile = useCallback((file: { type: string; size: number }): string | null => {
    if (!ACCEPTED_MIME_TYPES.has(file.type)) {
      return 'Formato inválido. Use PNG, JPEG ou WebP.'
    }
    if (file.size === 0) return 'Arquivo vazio.'
    if (file.size > MAX_INPUT_BYTES) return 'Imagem muito grande. Máximo 5 MB.'
    return null
  }, [])

  const openCropFor = useCallback(
    (file: File) => {
      setError(null)
      const validation = validateInputFile(file)
      if (validation) {
        setError(validation)
        return
      }
      const objectUrl = URL.createObjectURL(file)
      setSourceImageUrl(objectUrl)
      setSourceMimeType(file.type)
      setCrop(undefined)
      setCompletedCrop(undefined)
    },
    [validateInputFile]
  )

  const handlePick = useCallback(() => fileInputRef.current?.click(), [])

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) openCropFor(file)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [openCropFor]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragOver(false)
      const file = event.dataTransfer.files?.[0]
      if (file) openCropFor(file)
    },
    [openCropFor]
  )

  const handlePaste = useCallback(async () => {
    setError(null)
    try {
      // The Clipboard API is gated on user activation + permission. If the
      // browser blocks it, surface a friendly message instead of crashing.
      const clipboard = (navigator as Navigator).clipboard as Clipboard | undefined
      if (!clipboard || typeof clipboard.read !== 'function') {
        setError('Seu navegador não suporta colar da área de transferência. Use o seletor de arquivo ou arraste a foto.')
        return
      }
      const items = await clipboard.read()
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/') && ACCEPTED_MIME_TYPES.has(t))
        if (!imageType) continue
        const blob = await item.getType(imageType)
        const ext = imageType.split('/')[1] ?? 'png'
        const file = new File([blob], `colado.${ext}`, { type: imageType })
        openCropFor(file)
        return
      }
      setError('Nenhuma imagem encontrada na área de transferência.')
    } catch (err) {
      log('WARN', 'Guest photo paste failed', { error: err instanceof Error ? err.message : String(err) })
      setError('Não foi possível ler a área de transferência. Verifique a permissão do navegador.')
    }
  }, [openCropFor])

  const cancelCrop = useCallback(() => {
    setSourceImageUrl(null)
    setCrop(undefined)
    setCompletedCrop(undefined)
  }, [])

  const confirmCrop = useCallback(async () => {
    if (!imageRef.current || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      setError('Selecione uma área de crop antes de confirmar.')
      return
    }
    setIsUploading(true)
    setError(null)
    try {
      const blob = await cropToBlob(imageRef.current, completedCrop)
      if (!blob) {
        setError('Não foi possível processar o crop. Tente novamente.')
        return
      }

      const form = new FormData()
      form.append('videoId', videoId)
      form.append('role', 'guest')
      form.append('file', new File([blob], 'guest.png', { type: 'image/png' }))

      const response = await fetch('/api/wizard/thumbnail/upload', { method: 'POST', body: form })
      if (!response.ok) {
        let message = 'Falha ao enviar a foto. Tente novamente.'
        try {
          const payload = await response.json()
          if (payload?.error?.message) message = payload.error.message
        } catch {
          // ignore parse error
        }
        setError(message)
        log('WARN', 'Guest photo upload failed', { videoId, status: response.status })
        return
      }
      const data = (await response.json()) as { thumbnailUrl?: string }
      if (!data?.thumbnailUrl) {
        setError('Resposta inválida do servidor. Tente novamente.')
        return
      }
      onChange(data.thumbnailUrl)
      cancelCrop()
      log('INFO', 'Guest photo uploaded', { videoId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado.'
      setError(`Erro inesperado: ${message}`)
      log('WARN', 'Guest photo upload threw', { videoId, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setIsUploading(false)
    }
  }, [cancelCrop, completedCrop, onChange, videoId])

  const handleRemove = useCallback(() => {
    onChange(null)
    setError(null)
  }, [onChange])

  const hasPhoto = Boolean(currentUrl)

  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="guest-photo-uploader">
      <div className="flex items-center gap-2 text-xs font-medium">
        <UserRound className="h-3.5 w-3.5" />
        Foto do convidado (opcional)
      </div>
      <p className="text-[11px] text-muted-foreground">
        Para cortes, envie uma foto do convidado para a IAra usar como referência visual extra na geração. Aspect-ratio livre — você escolhe o enquadramento.
      </p>

      {hasPhoto && currentUrl ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/20 p-2" data-testid="guest-photo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt="Foto do convidado"
            className="h-16 w-16 rounded border bg-muted object-cover"
          />
          <div className="flex flex-col gap-1">
            <Button type="button" variant="outline" size="sm" onClick={handlePick} data-testid="guest-photo-replace">
              Substituir foto
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              data-testid="guest-photo-remove"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Remover
            </Button>
          </div>
        </div>
      ) : (
        <div
          data-testid="guest-photo-dropzone"
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-4 px-3 transition-colors',
            isDragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/10'
          )}
        >
          <p className="text-[11px] text-muted-foreground">
            {isDragOver ? 'Solte aqui' : 'Arraste a foto, selecione ou cole da área de transferência'}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePick}
              data-testid="guest-photo-pick"
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Selecionar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePaste}
              data-testid="guest-photo-paste"
            >
              <Clipboard className="h-3.5 w-3.5 mr-1" />
              Colar
            </Button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        className="sr-only"
        onChange={handleInputChange}
        data-testid="guest-photo-input"
      />

      {error && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive"
          data-testid="guest-photo-error"
        >
          <AlertTriangleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Crop modal */}
      <Dialog
        open={sourceImageUrl !== null}
        onOpenChange={(open) => {
          if (!open && !isUploading) cancelCrop()
        }}
      >
        <DialogContent className="max-w-2xl" data-testid="guest-photo-crop-modal" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Ajustar enquadramento</DialogTitle>
            <DialogDescription>
              Arraste as bordas para definir o crop. Sem restrição de proporção — escolha o enquadramento que melhor mostre o rosto do convidado.
            </DialogDescription>
          </DialogHeader>
          {sourceImageUrl && (
            <div className="flex justify-center max-h-[60vh] overflow-auto custom-scrollbar">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                // aspect omitido = aspect-ratio livre
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imageRef}
                  src={sourceImageUrl}
                  alt="Pré-crop"
                  className="max-h-[55vh] w-auto"
                />
              </ReactCrop>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={cancelCrop}
              disabled={isUploading}
              data-testid="guest-photo-crop-cancel"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmCrop}
              disabled={isUploading || !completedCrop || completedCrop.width === 0}
              data-testid="guest-photo-crop-confirm"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Confirmar crop e enviar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Silence the lint about unused import */}
      {sourceMimeType ? null : null}
    </div>
  )
}

/**
 * Renderiza o crop num canvas em escala natural e retorna o PNG resultante.
 * `crop` vem em pixels relativos ao img exibido — multiplicamos pela razão
 * entre tamanho natural e tamanho renderizado pra extrair os pixels reais.
 */
async function cropToBlob(image: HTMLImageElement, crop: PixelCrop): Promise<Blob | null> {
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(crop.width * scaleX))
  canvas.height = Math.max(1, Math.round(crop.height * scaleY))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  )
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}
