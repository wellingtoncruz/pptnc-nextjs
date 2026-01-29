'use client'

import {
  UploadIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  FileTextIcon,
  TagIcon,
  ListIcon,
  Loader2Icon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Video } from '@/types/video'

interface Phase8PublishProps {
  video: Video
  /** Whether the send operation is in progress */
  isSending?: boolean
  /** Whether the video was successfully sent */
  isSent?: boolean
  /** Error message if send failed */
  error?: string | null
  /** Callback when send button is clicked */
  onSend?: () => void
  /** Callback to retry after error */
  onRetry?: () => void
  className?: string
}

/**
 * Phase 8: Publish - Final Phase (No LLM)
 *
 * Displays a summary of video metadata and allows sending to YouTube.
 *
 * Key features:
 * - Shows title, description preview, tags count, chapters count
 * - Send button with loading, success, and error states
 * - No LLM processing, no revalidation
 * - Final phase - no advance button
 *
 * @see processamento_video.md - Fase 8 - Atualizar YouTube
 */
export function Phase8Publish({
  video,
  isSending = false,
  isSent = false,
  error,
  onSend,
  onRetry,
  className,
}: Phase8PublishProps) {
  const hasError = !!error
  const title = video.title || ''
  const description = video.description || ''
  const tags = video.tags || []
  const chapters = video.chapters || []

  // Truncate description for preview
  const descriptionPreview = description.length > 200
    ? description.substring(0, 200) + '...'
    : description

  // Validation: all required fields must exist
  const isValid = title.trim().length > 0 &&
    description.trim().length > 0 &&
    tags.length > 0

  // Determine button state
  const getButtonContent = () => {
    if (isSent) {
      return (
        <>
          <CheckCircleIcon className="size-4 mr-2" />
          Concluido
        </>
      )
    }
    if (isSending) {
      return (
        <>
          <Loader2Icon className="size-4 mr-2 animate-spin" />
          Enviando...
        </>
      )
    }
    return (
      <>
        <UploadIcon className="size-4 mr-2" />
        Enviar para o YouTube
      </>
    )
  }

  const handleClick = () => {
    if (hasError && onRetry) {
      onRetry()
    } else if (onSend) {
      onSend()
    }
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        {/* Error state */}
        {hasError && (
          <Card className="border-destructive">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-destructive">
                Erro ao Enviar
              </CardTitle>
              <CardDescription>
                Nao foi possivel enviar os metadados para o YouTube.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center gap-4 py-4">
                <AlertTriangleIcon className="size-12 text-destructive" />
                <p className="text-sm text-muted-foreground text-center">{error}</p>
                {onRetry && (
                  <Button variant="outline" onClick={onRetry}>
                    <RefreshCwIcon className="size-4 mr-2" />
                    Tentar novamente
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success state */}
        {isSent && !hasError && (
          <Card className="border-green-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-green-600 flex items-center gap-2">
                <CheckCircleIcon className="size-5" />
                Publicado com Sucesso!
              </CardTitle>
              <CardDescription>
                Os metadados foram atualizados no YouTube com sucesso.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Metadata summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumo dos Metadados</CardTitle>
            <CardDescription>
              Revise os dados antes de enviar para o YouTube.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Title */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileTextIcon className="size-4" />
                Titulo
              </div>
              <p className="text-sm font-medium">
                {title || <span className="text-muted-foreground italic">Titulo nao definido</span>}
              </p>
            </div>

            {/* Description preview */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileTextIcon className="size-4" />
                Descricao
              </div>
              <p className="text-sm text-muted-foreground">
                {descriptionPreview || <span className="italic">Descricao nao definida</span>}
              </p>
            </div>

            {/* Tags and Chapters count */}
            <div className="flex gap-4 pt-2">
              <div className="flex items-center gap-2">
                <TagIcon className="size-4 text-muted-foreground" />
                <Badge variant="secondary">
                  {tags.length} {tags.length === 1 ? 'tag' : 'tags'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <ListIcon className="size-4 text-muted-foreground" />
                <Badge variant="secondary">
                  {chapters.length} {chapters.length === 1 ? 'capitulo' : 'capitulos'}
                </Badge>
              </div>
            </div>

            {/* Validation warning */}
            {!isValid && !isSent && (
              <div className="flex items-center gap-2 text-amber-500 text-sm pt-2">
                <AlertTriangleIcon className="size-4" />
                <span>Preencha titulo, descricao e pelo menos 1 tag para enviar.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Send button */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={handleClick}
            disabled={!isValid || isSending || isSent}
            variant={isSent ? 'outline' : 'default'}
            size="lg"
          >
            {getButtonContent()}
          </Button>
        </div>
      </div>
    </div>
  )
}
