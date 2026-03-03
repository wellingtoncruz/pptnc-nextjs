'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Copy, Loader2, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAutoSave } from '@/hooks/use-auto-save'
import type { News } from '@/types/news'

interface NewsSocialPhaseProps {
  news: News
  onDataUpdate: () => Promise<void>
}

export function NewsSocialPhase({ news, onDataUpdate }: NewsSocialPhaseProps) {
  const [localText, setLocalText] = useState(news.social ?? '')
  const [isGenerating, setIsGenerating] = useState(news.social === null || news.social === undefined)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showContextInput, setShowContextInput] = useState(false)
  const [additionalContext, setAdditionalContext] = useState('')
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const generateTriggered = useRef(false)

  const saveFn = useCallback(async (text: string) => {
    const response = await fetch(`/api/news/${news.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ social: text }),
    })
    if (!response.ok) {
      throw new Error('Erro ao salvar')
    }
  }, [news.id])

  const { saveStatus, save: flushSave, resetValue } = useAutoSave(localText, saveFn)

  const generateSocial = useCallback(async (context?: string) => {
    setIsGenerating(true)
    setError(null)

    try {
      const fetchOptions: RequestInit = context
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ additionalContext: context }),
          }
        : { method: 'POST' }

      const response = await fetch(`/api/news/${news.id}/generate-social`, fetchOptions)

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error?.message || 'Erro ao gerar redação')
      }

      const data = await response.json()
      const generatedText = data.data?.social ?? ''
      setLocalText(generatedText)
      resetValue(generatedText)

      await onDataUpdate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsGenerating(false)
    }
  }, [news.id, onDataUpdate, resetValue])

  // Auto-generate on mount if social is null
  useEffect(() => {
    if (generateTriggered.current) return
    generateTriggered.current = true

    if (news.social === null || news.social === undefined) {
      generateSocial()
    }
  }, [generateSocial, news.social])

  const handleRegenerateClick = useCallback(() => {
    setShowContextInput(true)
  }, [])

  const handleConfirmRegenerate = useCallback(async () => {
    const context = additionalContext.trim() || undefined
    setShowContextInput(false)
    setAdditionalContext('')
    await flushSave()
    await generateSocial(context)
  }, [additionalContext, flushSave, generateSocial])

  const handleCancelRegenerate = useCallback(() => {
    setShowContextInput(false)
    setAdditionalContext('')
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(localText)
      clearTimeout(copyTimeoutRef.current)
      setCopied(true)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may not be available
    }
  }, [localText])

  if (isGenerating) {
    return (
      <div data-testid="news-social-generating" className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Gerando redação social...</p>
      </div>
    )
  }

  if (error && !localText) {
    return (
      <div data-testid="news-social-error" className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <AlertCircle className="size-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => { generateTriggered.current = false; generateSocial() }}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" data-testid="news-social-phase">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-border px-6 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!showContextInput && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateClick}
                disabled={isGenerating}
                data-testid="regenerate-social-button"
              >
                <RefreshCw className="mr-1 size-3.5" />
                Regenerar
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              disabled={!localText}
              data-testid="copy-social-button"
            >
              {copied ? (
                <Check className="mr-1 size-3.5 text-green-500" />
              ) : (
                <Copy className="mr-1 size-3.5" />
              )}
              {copied ? 'Copiado!' : 'Copiar'}
            </Button>
          </div>
          <span className="text-xs text-muted-foreground" data-testid="save-status">
            {saveStatus === 'pending' && 'Alterações pendentes...'}
            {saveStatus === 'saving' && 'Salvando...'}
            {saveStatus === 'saved' && 'Salvo'}
            {saveStatus === 'error' && 'Erro ao salvar'}
          </span>
        </div>
        {showContextInput && (
          <div className="mt-2 space-y-2">
            <textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Instruções adicionais para a IA (opcional)..."
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              rows={2}
              maxLength={500}
              data-testid="additional-context-input"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleConfirmRegenerate}
                disabled={isGenerating}
                data-testid="confirm-regenerate-button"
              >
                <RefreshCw className="mr-1 size-3.5" />
                Regenerar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelRegenerate}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Inline error when regeneration fails but text exists */}
      {error && localText && (
        <div className="shrink-0 flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-6 py-2" data-testid="social-inline-error">
          <AlertCircle className="size-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <textarea
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          className="w-full h-full min-h-[200px] resize-none bg-transparent text-sm leading-relaxed focus:outline-none placeholder:text-muted-foreground"
          placeholder="A redação social aparecerá aqui..."
          data-testid="social-editor"
        />
      </div>
    </div>
  )
}
