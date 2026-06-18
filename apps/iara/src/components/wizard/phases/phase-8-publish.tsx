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
  ImageIcon,
  LinkIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { resolveVideoPlaceholders } from '@/lib/youtube/format-chapters'
import type { Video } from '@/types/video'

/**
 * Resultado do upload da thumbnail pro YouTube — Story 22.5.
 * - `uploaded`: enviada com sucesso.
 * - `skipped`: vídeo não tinha `storageThumbnailUrl` válido (legacy base64 ou ausente).
 * - `failed`: chamada à YouTube API falhou (metadados foram salvos mesmo assim).
 * - `idle`: ainda não tentou (estado inicial / antes de clicar Publicar).
 */
export type ThumbnailPublishStatus = 'idle' | 'uploaded' | 'skipped' | 'failed'

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
  /**
   * Status do upload da thumbnail pro YouTube (Story 22.5). Independente do
   * `isSent` (que cobre só os metadados). Quando `failed` ou `skipped`, a UI
   * sinaliza claramente que o vídeo subiu sem thumbnail customizada.
   */
  thumbnailStatus?: ThumbnailPublishStatus
  thumbnailError?: string | null
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
  thumbnailStatus = 'idle',
  thumbnailError,
  className,
}: Phase8PublishProps) {
  const hasError = !!error
  const title = video.title || ''
  const description = video.description || ''
  const tags = video.tags || []
  const chapters = video.chapters || []
  const guests = video.guests || []
  const links = video.links || []

  // Trava de segurança (Epic 27 append): a publicação final só é liberada em
  // produção (ENVIRONMENT=PRD). A trava REAL é server-side (a rota retorna 403);
  // este botão é só UX. Default otimista `true` → em prod não há flash; em
  // ambiente de testes o fetch desabilita o botão (e, se clicarem no intervalo,
  // o server bloqueia mesmo assim).
  const [publishAllowed, setPublishAllowed] = useState<boolean>(true)
  useEffect(() => {
    let active = true
    fetch('/api/environment')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) setPublishAllowed(d?.data?.publishAllowed ?? false) })
      .catch(() => { if (active) setPublishAllowed(false) })
    return () => { active = false }
  }, [])

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
            {thumbnailStatus !== 'idle' && (
              <CardContent className="pt-0">
                {thumbnailStatus === 'uploaded' && (
                  <p className="text-sm text-green-600 flex items-center gap-2" data-testid="thumbnail-status-uploaded">
                    <CheckCircleIcon className="size-4" />
                    Thumbnail customizada enviada.
                  </p>
                )}
                {thumbnailStatus === 'skipped' && (
                  <p className="text-sm text-amber-500 flex items-center gap-2" data-testid="thumbnail-status-skipped">
                    <AlertTriangleIcon className="size-4" />
                    Thumbnail customizada não foi enviada — o vídeo continua com a do YouTube. Gere ou faça upload na fase Thumbnail antes de publicar.
                  </p>
                )}
                {thumbnailStatus === 'failed' && (
                  <p className="text-sm text-amber-500 flex items-start gap-2" data-testid="thumbnail-status-failed">
                    <AlertTriangleIcon className="size-4 mt-0.5 shrink-0" />
                    <span>
                      Metadados publicados, mas o envio da thumbnail falhou
                      {thumbnailError ? `: ${thumbnailError}` : '.'} Tente novamente direto no YouTube Studio.
                    </span>
                  </p>
                )}
              </CardContent>
            )}
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
            {/* Thumbnail preview (Story 22.5). Mostra a thumbnail final
                que será enviada ao YouTube. Para storageThumbnailUrl legacy
                em base64 (TD-5), exibe o preview mas o upload é skippado. */}
            <div className="space-y-1" data-testid="thumbnail-summary">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <ImageIcon className="size-4" />
                Thumbnail
              </div>
              {video.storageThumbnailUrl ? (
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={video.storageThumbnailUrl}
                    alt="Thumbnail final"
                    className="h-20 w-auto rounded border bg-muted object-cover"
                  />
                  <p className="text-xs text-muted-foreground">
                    Será enviada ao YouTube junto com os metadados.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-amber-500">
                  Nenhuma thumbnail selecionada. O vídeo continuará com a thumbnail automática do YouTube.
                </p>
              )}
            </div>

            <Separator />

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

            {/* Guests — mostrados antes da Descrição (ordem do resumo, Epic 26) */}
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

            {/* Links (Epic 26) — o resumo mostra todos os cadastrados; só os
                marcados "incluir na descrição" entram de fato na descrição do YouTube. */}
            {links.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <LinkIcon className="size-4" />
                    Links ({links.length})
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {links.map((link, index) => (
                      <li key={index} className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{link.description}</span>
                          {link.includeInDescription && (
                            <Badge variant="secondary" className="text-[10px]">
                              na descrição
                            </Badge>
                          )}
                        </div>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {link.url}
                        </a>
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
                    {resolveVideoPlaceholders(youtubeFooter, placeholderVideo)}
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

        {/* Trava de segurança: ambiente de testes não autoriza publicação final */}
        {!publishAllowed && !isSent && (
          <div
            data-testid="publish-env-lock"
            className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-200"
          >
            <span>⚠️ Ambiente de testes, publicação final não autorizada</span>
          </div>
        )}

        {/* Send button */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={handleClick}
            disabled={!isValid || isSending || isSent || !publishAllowed}
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
