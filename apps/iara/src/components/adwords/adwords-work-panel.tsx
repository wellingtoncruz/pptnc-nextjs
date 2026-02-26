'use client'

import { useState } from 'react'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'

import { useAdwords } from '@/hooks/use-adwords'
import { Button } from '@/components/ui/button'
import type { VideoSummary } from '@/types/video'

import { AdwordsGuideDisplay } from './adwords-guide-display'
import { AdwordsKeywordsDisplay } from './adwords-keywords-display'

interface AdwordsWorkPanelProps {
  videoId: string
  video: VideoSummary
}

export function AdwordsWorkPanel({ videoId, video }: AdwordsWorkPanelProps) {
  const hasPrerequisites = !!video.title && !!video.description && !!video.transcriptionTXT
  const { data, isLoading, isGenerating, error, retry, reprocess } = useAdwords(videoId, hasPrerequisites)

  const [showReprocess, setShowReprocess] = useState(false)
  const [additionalContext, setAdditionalContext] = useState('')
  const [reprocessError, setReprocessError] = useState<string | null>(null)

  const handleReprocess = async () => {
    setReprocessError(null)
    try {
      await reprocess(additionalContext)
      setShowReprocess(false)
      setAdditionalContext('')
    } catch (err) {
      setReprocessError(err instanceof Error ? err.message : 'Erro ao reprocessar')
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div data-testid="adwords-loading" className="flex items-center justify-center h-full">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Generating state
  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Gerando guia de tráfego pago...</p>
      </div>
    )
  }

  // Ineligible state
  if (error === 'ineligible') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
        <AlertCircle className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Este episódio precisa ter título, descrição e transcrição disponíveis para gerar o guia de tráfego pago.
        </p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={retry}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  // Result state
  if (data) {
    return (
      <div className="flex flex-col h-full p-5 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Guia de Tráfego Pago</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowReprocess(!showReprocess)}
          >
            <RefreshCw className="size-4 mr-1" />
            Reprocessar
          </Button>
        </div>

        {showReprocess && (
          <div className="mb-4 space-y-2">
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Contexto adicional (opcional)"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              maxLength={500}
              rows={3}
            />
            {reprocessError && (
              <p className="text-sm text-destructive">{reprocessError}</p>
            )}
            <Button size="sm" onClick={handleReprocess}>
              Gerar novamente
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar mb-4">
          <AdwordsGuideDisplay guide={data.guide} />
        </div>

        <div className="border-t pt-4">
          <AdwordsKeywordsDisplay keywords={data.keywords} />
        </div>
      </div>
    )
  }

  return null
}
