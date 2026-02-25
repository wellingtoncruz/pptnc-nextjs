'use client'

import { useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ProcessingSpinner } from '@/components/wizard/processing-spinner'
import { SocialPostEditor } from './social-post-editor'
import type { SocialPost } from '@/types/social'

interface SocialPostColumnProps {
  networkId: string
  networkName: string
  networkIcon: string
  videoId: string
  post: SocialPost | null
  isGenerating: boolean
  isLoading: boolean
  isReprocessing: boolean
  error: string | null
  onRetry: () => void
  onReprocess: (networkId: string, additionalContext?: string) => Promise<void>
  onPostUpdated: (networkId: string, post: SocialPost) => void
}

export function SocialPostColumn({
  networkId,
  networkName,
  networkIcon,
  videoId,
  post,
  isGenerating,
  isLoading,
  isReprocessing,
  error,
  onRetry,
  onReprocess,
  onPostUpdated,
}: SocialPostColumnProps) {
  const [showReprocessForm, setShowReprocessForm] = useState(false)
  const [additionalContext, setAdditionalContext] = useState('')
  const [reprocessError, setReprocessError] = useState<string | null>(null)

  const handleReprocess = async () => {
    setReprocessError(null)
    try {
      await onReprocess(networkId, additionalContext || undefined)
      setShowReprocessForm(false)
      setAdditionalContext('')
    } catch (err) {
      setReprocessError(err instanceof Error ? err.message : 'Erro ao reprocessar')
    }
  }

  return (
    <div
      data-testid="social-post-column"
      className="w-[640px] shrink-0 h-full flex flex-col p-3 gap-3"
    >
      {/* Card wrapper */}
      <div className="flex flex-col flex-1 min-h-0 rounded-lg border shadow-sm bg-card overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-accent/30">
          <div className="flex items-center gap-2">
            <span className="text-2xl" role="img" aria-label={networkName}>{networkIcon}</span>
            <span className="text-sm font-semibold">{networkName}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <ProcessingSpinner className="h-full" />
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-4 h-full">
            <AlertTriangle className="h-10 w-10 text-destructive opacity-60" />
            <p className="text-sm text-muted-foreground text-center">{error}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        ) : isGenerating || isReprocessing ? (
          <ProcessingSpinner
            text={`Aguarde, gerando seu melhor post para o ${networkName}...`}
            className="h-full"
          />
        ) : post ? (
          <SocialPostEditor
            videoId={videoId}
            networkId={networkId}
            post={post}
            onPostUpdated={(updatedPost) => onPostUpdated(networkId, updatedPost)}
          />
        ) : (
          /* Queued — waiting for its turn */
          <ProcessingSpinner className="h-full opacity-40" />
        )}
        </div>

        {/* Reprocess section */}
        {post && !isReprocessing && (
          <div className="px-5 pb-4 border-t border-border pt-3">
            {reprocessError && (
              <p className="text-xs text-destructive mb-2">{reprocessError}</p>
            )}
            {showReprocessForm ? (
              <div className="space-y-3 border border-border rounded-md p-3">
                <Textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  maxLength={500}
                  className="min-h-[80px] resize-none"
                  placeholder="Ex: Foque mais no convidado principal..."
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleReprocess}>
                    <RefreshCw className="size-4 mr-2" />
                    Gerar novamente
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowReprocessForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowReprocessForm(true)}>
                <RefreshCw className="size-4 mr-2" />
                Reprocessar
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
