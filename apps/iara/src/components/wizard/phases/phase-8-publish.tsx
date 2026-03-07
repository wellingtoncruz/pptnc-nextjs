'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  UploadIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  FileTextIcon,
  TagIcon,
  ListIcon,
  Loader2Icon,
  UsersIcon,
  LinkedinIcon,
  ClockIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { resolveFooterPlaceholders } from '@/lib/youtube/format-chapters'
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
  const guests = video.guests || []

  // Fetch youtubeFooter from podcast settings
  const [youtubeFooter, setYoutubeFooter] = useState<string>('')
  // For cuts/reels, fetch parent episode data for placeholder resolution
  const [placeholderVideo, setPlaceholderVideo] = useState<Record<string, unknown>>(video)
  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch('/api/podcast')
        if (response.ok) {
          const data = await response.json()
          setYoutubeFooter(data.data?.youtubeFooter || '')
        }
      } catch {
        // Silently ignore - youtubeFooter is optional
      }

      // For cuts/reels, resolve placeholders from parent episode
      if (video.parentEpisodeId && (video.videoType === 'cut' || video.videoType === 'reel')) {
        try {
          const parentResponse = await fetch(`/api/videos/${video.parentEpisodeId}`)
          if (parentResponse.ok) {
            const parentResult = await parentResponse.json()
            if (parentResult.data) {
              setPlaceholderVideo(parentResult.data)
            }
          }
        } catch {
          // Fallback to current video
        }
      }
    }
    fetchSettings()
  }, [video.parentEpisodeId, video.videoType])

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

  const handleClick = useCallback(() => {
    if (hasError && onRetry) {
      onRetry()
    } else if (onSend) {
      onSend()
    }
  }, [hasError, onRetry, onSend])

  // Cmd/Ctrl+Enter shortcut to send
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (isValid && !isSending && !isSent) {
          e.preventDefault()
          handleClick()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isValid, isSending, isSent, handleClick])

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
                Título
              </div>
              <p className="text-sm font-medium">
                {title || <span className="text-muted-foreground italic">Título não definido</span>}
              </p>
            </div>

            <Separator />

            {/* Description - full content */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileTextIcon className="size-4" />
                Descrição
              </div>
              <p className="text-sm whitespace-pre-wrap">
                {description || <span className="text-muted-foreground italic">Descrição não definida</span>}
              </p>
            </div>

            {/* Guests */}
            {guests.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <UsersIcon className="size-4" />
                    Convidados
                  </div>
                  <ul className="space-y-2 text-sm">
                    {guests.map((guest, index) => (
                      <li key={index} className="space-y-0.5">
                        <div className="font-medium">{guest.name}</div>
                        {guest.linkedin && (
                          <a
                            href={guest.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <LinkedinIcon className="size-3" />
                            <span className="text-xs truncate max-w-xs">{guest.linkedin}</span>
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {/* Chapters */}
            {chapters.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <ClockIcon className="size-4" />
                    Capítulos
                  </div>
                  <ul className="space-y-1 text-sm">
                    {chapters.map((chapter, index) => (
                      <li key={index} className="flex items-center gap-3">
                        <span className="font-mono text-muted-foreground shrink-0">
                          {chapter.timestamp}
                        </span>
                        <span>{chapter.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <TagIcon className="size-4" />
                    Tags ({tags.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* YouTube Footer (with resolved placeholders) */}
            {youtubeFooter && (
              <>
                <Separator />
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <ListIcon className="size-4" />
                    Rodapé do YouTube
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {resolveFooterPlaceholders(youtubeFooter, placeholderVideo)}
                  </p>
                </div>
              </>
            )}

            {/* Validation warning */}
            {!isValid && !isSent && (
              <div className="flex items-center gap-2 text-amber-500 text-sm pt-2">
                <AlertTriangleIcon className="size-4" />
                <span>Preencha título, descrição e pelo menos 1 tag para enviar.</span>
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
