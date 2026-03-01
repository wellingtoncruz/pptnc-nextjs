'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

import { useNewsletterImage } from '@/hooks/use-newsletter-image'
import type { ImageGeneratingStep } from '@/hooks/use-newsletter-image'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { NewsletterStatus } from '@/lib/newsletter/types'

const STEP_MESSAGES: Record<string, string> = {
  generating_prompt: 'Imaginando a imagem perfeita para a newsletter...',
  generating_image: 'Criando a imagem...',
  uploading: 'Salvando a imagem...',
  saving: 'Finalizando...',
}

interface NewsletterImagePhaseProps {
  videoId: string
  newsletterStatus: NewsletterStatus | null
  onStatusChange?: (status: NewsletterStatus) => void
}

export function NewsletterImagePhase({ videoId, newsletterStatus: externalStatus, onStatusChange }: NewsletterImagePhaseProps) {
  const {
    imageUrl,
    imagePrompt,
    newsletterStatus: hookStatus,
    isLoading,
    isGenerating,
    generatingStep,
    error,
    errorImagePrompt,
    generate,
    regenerateFromPrompt,
    retry,
  } = useNewsletterImage(videoId)

  const effectiveStatus = hookStatus ?? externalStatus
  const hasPrerequisites = !!effectiveStatus && effectiveStatus !== 'idle' && effectiveStatus !== 'draft'

  const [additionalContext, setAdditionalContext] = useState('')
  const [editablePrompt, setEditablePrompt] = useState('')

  // Sync editablePrompt from hook when image prompt changes
  useEffect(() => {
    if (imagePrompt) {
      setEditablePrompt(imagePrompt)
    }
  }, [imagePrompt])

  // Auto-generate when arriving at this phase with no prior image
  const autoGenerateTriggeredRef = useRef(false)

  useEffect(() => {
    autoGenerateTriggeredRef.current = false
  }, [videoId])

  useEffect(() => {
    if (
      !isLoading && !imageUrl && !error && !isGenerating
      && hasPrerequisites && !autoGenerateTriggeredRef.current
    ) {
      autoGenerateTriggeredRef.current = true
      generate()
        .catch(() => { /* error already handled by hook state */ })
    }
  }, [isLoading, imageUrl, error, isGenerating, hasPrerequisites, generate])

  const handleGenerate = useCallback(async () => {
    await generate(additionalContext || undefined)
  }, [generate, additionalContext])

  // Regenerate image using the edited prompt (skip Call 1)
  const handleRegenerateFromPrompt = useCallback(async () => {
    if (!editablePrompt.trim()) return
    await regenerateFromPrompt(editablePrompt.trim())
  }, [regenerateFromPrompt, editablePrompt])

  const handleContinue = useCallback(() => {
    onStatusChange?.('image_ready')
  }, [onStatusChange])

  // Loading state
  if (isLoading) {
    return (
      <div data-testid="newsletter-image-loading" className="flex items-center justify-center h-full">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Prerequisites not met (status < news_selected)
  if (!effectiveStatus || effectiveStatus === 'idle' || effectiveStatus === 'draft') {
    return (
      <div data-testid="newsletter-image-prerequisites" className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
        <AlertCircle className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Complete as Fases 1 e 2 antes de gerar a imagem
        </p>
      </div>
    )
  }

  // Generating state with progressive feedback
  if (isGenerating) {
    const stepMessage = generatingStep
      ? STEP_MESSAGES[generatingStep] || 'Processando...'
      : 'Gerando imagem da newsletter...'

    return (
      <div data-testid="newsletter-image-generating" className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground" data-testid="generating-step-message">{stepMessage}</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div data-testid="newsletter-image-error" className="flex flex-col items-center justify-center h-full gap-4 px-8">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm text-destructive text-center">{error}</p>
        {errorImagePrompt && (
          <details className="w-full max-w-lg">
            <summary className="text-xs text-muted-foreground cursor-pointer">Prompt gerado (debug)</summary>
            <pre className="mt-2 p-3 text-xs bg-muted rounded-md whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
              {errorImagePrompt}
            </pre>
          </details>
        )}
        <Button variant="outline" size="sm" onClick={retry}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  // Result state: image exists with editable prompt
  if (imageUrl) {
    const promptChanged = editablePrompt.trim() !== (imagePrompt || '').trim()

    return (
      <div data-testid="newsletter-image-result" className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <h4 className="text-sm font-medium">Imagem da Newsletter</h4>
          <Button size="sm" onClick={handleContinue}>
            Continuar
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {/* Image preview */}
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border">
            <img
              src={imageUrl}
              alt="Imagem da newsletter"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>

          {/* Editable prompt */}
          <div>
            <label className="text-xs text-muted-foreground">Prompt utilizado</label>
            <Textarea
              data-testid="editable-prompt"
              value={editablePrompt}
              onChange={(e) => setEditablePrompt(e.target.value)}
              className="mt-1 text-xs font-mono resize-none"
              rows={4}
              maxLength={2000}
            />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={handleRegenerateFromPrompt}
              disabled={!promptChanged || !editablePrompt.trim()}
            >
              Regenerar Imagem
            </Button>
          </div>

          {/* Separator */}
          <hr className="border-border" />

          {/* Full regeneration */}
          <div>
            <label className="text-xs text-muted-foreground">Gerar novo prompt + nova imagem</label>
            <Textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Dica adicional (opcional): Ex: Use tons de azul e roxo, estilo cyberpunk..."
              maxLength={500}
              className="mt-1 text-sm resize-none"
              rows={2}
            />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={handleGenerate}
            >
              Novo Prompt + Imagem
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Empty state: ready to generate (status === news_selected, no image yet)
  return (
    <div data-testid="newsletter-image-empty" className="flex flex-col items-center justify-center h-full gap-4 px-8">
      <p className="text-sm text-muted-foreground text-center">
        Gere uma imagem de capa para a newsletter usando IA
      </p>
      <div className="w-full max-w-md">
        <Textarea
          value={additionalContext}
          onChange={(e) => setAdditionalContext(e.target.value)}
          placeholder="Dica adicional (opcional): Ex: Use tons de azul e roxo, estilo cyberpunk..."
          maxLength={500}
          className="text-sm resize-none"
          rows={3}
        />
      </div>
      <Button onClick={handleGenerate}>
        Gerar Imagem
      </Button>
    </div>
  )
}
