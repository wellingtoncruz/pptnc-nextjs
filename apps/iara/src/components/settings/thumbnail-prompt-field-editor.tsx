'use client'

import { useState, useEffect, useRef } from 'react'
import { z } from 'zod'

import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAutoSave } from '@/hooks/use-auto-save'
import { log } from '@/lib/logger'
import { MAX_PROMPT_LENGTH } from '@/lib/schemas/podcast'
import { SaveStatusIndicator } from './save-status-indicator'
import type { ThumbnailPromptField } from '@/types/podcast'

const FieldSchema = z.string().max(MAX_PROMPT_LENGTH, 'Campo deve ter no máximo 10000 caracteres')

/** Accepted MIME types for the Base and Reference thumbnail images. */
const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/** Maximum upload size in bytes (5 MB). Enforced both client-side and server-side. */
export const MAX_THUMBNAIL_CONFIG_IMAGE_BYTES = 5 * 1024 * 1024

interface ThumbnailPromptFieldEditorProps {
  fieldKey: string
  videoType: 'episode' | 'cut'
  initialValue: ThumbnailPromptField
  onSave: (value: ThumbnailPromptField) => Promise<void>
}

type ImageRole = 'base' | 'reference'

/**
 * Editor for the Thumbnail prompt sub-section (Epic 22).
 *
 * Layout: description + expectedOutput (same as PromptFieldEditor) followed by two
 * image upload slots (Base and Referência) with preview, replace and remove actions.
 *
 * Uploads go through POST /api/settings/thumbnail-config (multipart), and the URL
 * returned by the endpoint is persisted via the auto-save chain that already handles
 * the textual fields.
 */
export function ThumbnailPromptFieldEditor({
  fieldKey,
  videoType,
  initialValue,
  onSave,
}: ThumbnailPromptFieldEditorProps) {
  const [description, setDescription] = useState(initialValue.description)
  const [expectedOutput, setExpectedOutput] = useState(initialValue.expectedOutput)
  const [baseImageUrl, setBaseImageUrl] = useState(initialValue.baseImageUrl)
  const [baseImageMimeType, setBaseImageMimeType] = useState(initialValue.baseImageMimeType)
  const [referenceImageUrl, setReferenceImageUrl] = useState(initialValue.referenceImageUrl)
  const [referenceImageMimeType, setReferenceImageMimeType] = useState(initialValue.referenceImageMimeType)
  const [uploadingRole, setUploadingRole] = useState<ImageRole | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const baseInputRef = useRef<HTMLInputElement>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setDescription(initialValue.description)
    setExpectedOutput(initialValue.expectedOutput)
    setBaseImageUrl(initialValue.baseImageUrl)
    setBaseImageMimeType(initialValue.baseImageMimeType)
    setReferenceImageUrl(initialValue.referenceImageUrl)
    setReferenceImageMimeType(initialValue.referenceImageMimeType)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    initialValue.description,
    initialValue.expectedOutput,
    initialValue.baseImageUrl,
    initialValue.baseImageMimeType,
    initialValue.referenceImageUrl,
    initialValue.referenceImageMimeType,
  ])

  const combinedValue = JSON.stringify({
    description,
    expectedOutput,
    baseImageUrl,
    baseImageMimeType,
    referenceImageUrl,
    referenceImageMimeType,
  })

  const { saveStatus, save } = useAutoSave(
    combinedValue,
    async () => {
      setValidationError(null)

      const descResult = FieldSchema.safeParse(description)
      if (!descResult.success) {
        setValidationError(descResult.error.issues[0]?.message || 'Descrição inválida')
        return
      }
      const outputResult = FieldSchema.safeParse(expectedOutput)
      if (!outputResult.success) {
        setValidationError(outputResult.error.issues[0]?.message || 'Saída esperada inválida')
        return
      }

      try {
        await onSave({
          description,
          expectedOutput,
          baseImageUrl,
          baseImageMimeType,
          referenceImageUrl,
          referenceImageMimeType,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar'
        setValidationError(message)
        log('ERROR', 'Failed to save thumbnail prompt field', { fieldKey, error: message })
      }
    },
    1500
  )

  async function handleFileSelected(role: ImageRole, file: File) {
    setUploadError(null)

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      setUploadError('Formato inválido. Use PNG, JPEG ou WebP.')
      return
    }
    if (file.size > MAX_THUMBNAIL_CONFIG_IMAGE_BYTES) {
      setUploadError('Imagem muito grande. Máximo 5 MB.')
      return
    }

    setUploadingRole(role)
    try {
      const formData = new FormData()
      formData.set('videoType', videoType)
      formData.set('role', role)
      formData.set('file', file)

      const res = await fetch('/api/settings/thumbnail-config', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const message = await res.text().catch(() => '')
        throw new Error(message || `Falha no upload (HTTP ${res.status})`)
      }

      const data = (await res.json()) as { url: string; mimeType: string }
      if (role === 'base') {
        setBaseImageUrl(data.url)
        setBaseImageMimeType(data.mimeType)
      } else {
        setReferenceImageUrl(data.url)
        setReferenceImageMimeType(data.mimeType)
      }
      // useAutoSave depende de combinedValue mudar — o setState acima dispara o ciclo.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro no upload'
      setUploadError(message)
      log('ERROR', 'Thumbnail config upload failed', { fieldKey, role, error: message })
    } finally {
      setUploadingRole(null)
    }
  }

  function handleRemove(role: ImageRole) {
    if (role === 'base') {
      setBaseImageUrl(undefined)
      setBaseImageMimeType(undefined)
    } else {
      setReferenceImageUrl(undefined)
      setReferenceImageMimeType(undefined)
    }
  }

  const isDescOverLimit = description.length > MAX_PROMPT_LENGTH
  const isOutputOverLimit = expectedOutput.length > MAX_PROMPT_LENGTH

  const descCounterId = `${fieldKey}-description-counter`
  const outputCounterId = `${fieldKey}-output-counter`
  const errorId = `${fieldKey}-error`

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h4 className="font-medium">Thumbnail</h4>

      {/* Description field */}
      <div className="space-y-2">
        <Label htmlFor={`${fieldKey}-description`}>Descrição do Prompt</Label>
        <Textarea
          id={`${fieldKey}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => save()}
          placeholder="Descreva o que o LLM deve fazer ao gerar o thumbnail..."
          className="min-h-[100px] resize-y"
          aria-invalid={isDescOverLimit}
          aria-describedby={`${descCounterId}${validationError ? ` ${errorId}` : ''}`}
        />
        <div className="flex items-center justify-end text-xs">
          <span
            id={descCounterId}
            className={isDescOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}
          >
            {description.length} / {MAX_PROMPT_LENGTH}
          </span>
        </div>
      </div>

      {/* Expected Output field */}
      <div className="space-y-2">
        <Label htmlFor={`${fieldKey}-output`}>Saída Esperada</Label>
        <Textarea
          id={`${fieldKey}-output`}
          value={expectedOutput}
          onChange={(e) => setExpectedOutput(e.target.value)}
          onBlur={() => save()}
          placeholder="Descreva o resultado visual esperado..."
          className="min-h-[100px] resize-y"
          aria-invalid={isOutputOverLimit}
          aria-describedby={`${outputCounterId}${validationError ? ` ${errorId}` : ''}`}
        />
        <div className="flex items-center justify-end text-xs">
          <span
            id={outputCounterId}
            className={isOutputOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'}
          >
            {expectedOutput.length} / {MAX_PROMPT_LENGTH}
          </span>
        </div>
      </div>

      {/* Base image */}
      <ImageSlot
        role="base"
        label="Thumbnail Base"
        helperText="Imagem que define a arte/composição que o modelo usa como ponto de partida."
        imageUrl={baseImageUrl}
        mimeType={baseImageMimeType}
        uploading={uploadingRole === 'base'}
        inputRef={baseInputRef}
        onSelectFile={(file) => handleFileSelected('base', file)}
        onRemove={() => handleRemove('base')}
        fieldKey={fieldKey}
      />

      {/* Reference image */}
      <ImageSlot
        role="reference"
        label="Thumbnail Referência"
        helperText="Imagem cujas características o modelo reproduz adaptando para o novo contexto, mantendo as características."
        imageUrl={referenceImageUrl}
        mimeType={referenceImageMimeType}
        uploading={uploadingRole === 'reference'}
        inputRef={referenceInputRef}
        onSelectFile={(file) => handleFileSelected('reference', file)}
        onRemove={() => handleRemove('reference')}
        fieldKey={fieldKey}
      />

      {uploadError && (
        <p className="text-xs text-destructive" role="alert">
          {uploadError}
        </p>
      )}

      {validationError ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {validationError}
        </p>
      ) : (
        <SaveStatusIndicator status={saveStatus} />
      )}
    </div>
  )
}

interface ImageSlotProps {
  role: ImageRole
  label: string
  helperText: string
  imageUrl: string | undefined
  mimeType: string | undefined
  uploading: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
  onSelectFile: (file: File) => void
  onRemove: () => void
  fieldKey: string
}

function ImageSlot({
  role,
  label,
  helperText,
  imageUrl,
  uploading,
  inputRef,
  onSelectFile,
  onRemove,
  fieldKey,
}: ImageSlotProps) {
  const inputId = `${fieldKey}-${role}-input`

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <p className="text-xs text-muted-foreground">{helperText}</p>
      <div className="flex items-start gap-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`Preview ${label}`}
            className="h-24 w-auto rounded border bg-muted object-cover"
          />
        ) : (
          <div className="h-24 w-24 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">
            sem imagem
          </div>
        )}
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPTED_MIME_TYPES.join(',')}
            className="hidden"
            aria-label={label}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onSelectFile(file)
              if (inputRef.current) inputRef.current.value = ''
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? 'Enviando…' : imageUrl ? 'Substituir' : 'Carregar imagem'}
          </Button>
          {imageUrl && !uploading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
            >
              Remover
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
