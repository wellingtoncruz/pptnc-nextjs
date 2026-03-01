'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import Markdown from 'react-markdown'

import { useNewsletterDraft } from '@/hooks/use-newsletter-draft'
import { useAutoSave } from '@/hooks/use-auto-save'
import { Button } from '@/components/ui/button'
import { SaveStatusIndicator } from '@/components/settings/save-status-indicator'
import type { NewsletterStatus } from '@/lib/newsletter/types'
import type { VideoSummary } from '@/types/video'

import { markdownComponents } from './newsletter-markdown-components'

interface NewsletterDraftPhaseProps {
  videoId: string
  video: VideoSummary
  onStatusChange?: (status: NewsletterStatus) => void
}

export function NewsletterDraftPhase({ videoId, video, onStatusChange }: NewsletterDraftPhaseProps) {
  const hasPrerequisites = !!video.title && !!video.description && !!video.transcriptionTXT
  const {
    draft,
    newsletterStatus,
    isLoading,
    isGenerating,
    error,
    generate,
    saveDraft,
    retry,
  } = useNewsletterDraft(videoId)

  const hasDraft = draft !== null && draft !== ''
  const isRegenerate = hasDraft || (newsletterStatus && newsletterStatus !== 'idle')

  // Local editor state
  const [localDraft, setLocalDraft] = useState(draft ?? '')
  const [additionalContext, setAdditionalContext] = useState('')
  const hasUserEdited = useRef(false)

  // Bug 1: Auto-generate when no data exists in Firestore
  const autoGenerateTriggeredRef = useRef(false)

  useEffect(() => {
    autoGenerateTriggeredRef.current = false
  }, [videoId])

  useEffect(() => {
    if (
      !isLoading && !hasDraft && !error && !isGenerating
      && hasPrerequisites
      && !autoGenerateTriggeredRef.current
      && newsletterStatus === null
    ) {
      autoGenerateTriggeredRef.current = true
      generate()
    }
  }, [isLoading, hasDraft, error, isGenerating, hasPrerequisites, newsletterStatus, generate])

  // Auto-save (must be before sync useEffect that uses resetValue)
  const saveDraftCallback = useCallback(
    async (value: string) => {
      await saveDraft(value)
    },
    [saveDraft]
  )
  const { saveStatus, save: flushSave, resetValue } = useAutoSave(localDraft, saveDraftCallback, 1500)

  // Sync from hook draft to local state (only if user hasn't started editing)
  useEffect(() => {
    if (draft !== null && !hasUserEdited.current) {
      setLocalDraft(draft)
      resetValue(draft)
    }
  }, [draft, resetValue])

  // Debounced preview (500ms)
  const [debouncedDraft, setDebouncedDraft] = useState('')
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }
    previewTimeoutRef.current = setTimeout(() => {
      setDebouncedDraft(localDraft)
    }, 500)
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current)
      }
    }
  }, [localDraft])

  const handleGenerate = useCallback(async () => {
    hasUserEdited.current = false
    await generate(additionalContext || undefined)
  }, [generate, additionalContext])

  // Flush pending auto-save before navigating to Phase 2
  const handleConfirmDraft = useCallback(async () => {
    await flushSave()
    onStatusChange?.('draft')
  }, [flushSave, onStatusChange])

  // Bug 3: Scroll sync between editor and preview
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const isScrollSyncingRef = useRef(false)

  const handleEditorScroll = useCallback(() => {
    if (isScrollSyncingRef.current) return
    const editor = editorRef.current
    const preview = previewRef.current
    if (!editor || !preview) return
    isScrollSyncingRef.current = true
    const maxScroll = editor.scrollHeight - editor.clientHeight
    const pct = maxScroll > 0 ? editor.scrollTop / maxScroll : 0
    preview.scrollTop = pct * (preview.scrollHeight - preview.clientHeight)
    requestAnimationFrame(() => { isScrollSyncingRef.current = false })
  }, [])

  const handlePreviewScroll = useCallback(() => {
    if (isScrollSyncingRef.current) return
    const editor = editorRef.current
    const preview = previewRef.current
    if (!editor || !preview) return
    isScrollSyncingRef.current = true
    const maxScroll = preview.scrollHeight - preview.clientHeight
    const pct = maxScroll > 0 ? preview.scrollTop / maxScroll : 0
    editor.scrollTop = pct * (editor.scrollHeight - editor.clientHeight)
    requestAnimationFrame(() => { isScrollSyncingRef.current = false })
  }, [])

  // Loading state
  if (isLoading) {
    return (
      <div data-testid="newsletter-draft-loading" className="flex items-center justify-center h-full">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Ineligible state
  if (!hasPrerequisites) {
    return (
      <div data-testid="newsletter-draft-ineligible" className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
        <AlertCircle className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Este episódio precisa de título, descrição e transcrição para gerar o draft
        </p>
      </div>
    )
  }

  // Generating state
  if (isGenerating) {
    return (
      <div data-testid="newsletter-draft-generating" className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Gerando draft da newsletter...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div data-testid="newsletter-draft-error" className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={retry}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  // Result state — editor + preview
  if (hasDraft) {
    return (
      <div data-testid="newsletter-draft-result" className="flex flex-col h-full">
        {/* Header with actions */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <h4 className="text-sm font-medium">Editor</h4>
            <SaveStatusIndicator status={saveStatus} />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleGenerate}>
              Regenerar
            </Button>
            <Button size="sm" onClick={handleConfirmDraft}>
              <Check className="size-4 mr-1" />
              Confirmar Draft
            </Button>
          </div>
        </div>

        {/* Bug 2: additionalContext textarea for regeneration */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
          <input
            data-testid="newsletter-additional-context"
            type="text"
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground"
            placeholder="Dica adicional para regeneração (opcional)"
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            maxLength={500}
          />
        </div>

        {/* Editor + Preview side by side */}
        <div className="flex flex-1 min-h-0">
          {/* Editor */}
          <div className="flex-1 flex flex-col border-r border-border">
            <textarea
              ref={editorRef}
              data-testid="newsletter-draft-editor"
              aria-label="Editor do draft da newsletter"
              className="flex-1 resize-none p-4 bg-background text-foreground text-sm font-mono focus:outline-none custom-scrollbar"
              value={localDraft}
              onChange={(e) => { hasUserEdited.current = true; setLocalDraft(e.target.value) }}
              onScroll={handleEditorScroll}
            />
          </div>
          {/* Preview */}
          <div
            ref={previewRef}
            data-testid="newsletter-draft-preview"
            className="flex-1 overflow-y-auto custom-scrollbar p-4 text-sm leading-relaxed"
            onScroll={handlePreviewScroll}
          >
            <Markdown components={markdownComponents}>{debouncedDraft}</Markdown>
          </div>
        </div>
      </div>
    )
  }

  // Empty state — generate button
  return (
    <div data-testid="newsletter-draft-empty" className="flex flex-col items-center justify-center h-full gap-4 px-8">
      <p className="text-sm text-muted-foreground text-center">
        Clique no botão abaixo para gerar o draft da newsletter a partir da transcrição do episódio.
      </p>
      <textarea
        data-testid="newsletter-additional-context"
        className="w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
        placeholder="Dica adicional (opcional)"
        value={additionalContext}
        onChange={(e) => setAdditionalContext(e.target.value)}
        maxLength={500}
        rows={3}
      />
      <Button onClick={handleGenerate}>
        {isRegenerate ? 'Regenerar' : 'Gerar Draft'}
      </Button>
    </div>
  )
}
