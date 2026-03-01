'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import Markdown from 'react-markdown'

import { useNewsletterReport } from '@/hooks/use-newsletter-report'
import { useAutoSave } from '@/hooks/use-auto-save'
import { Button } from '@/components/ui/button'
import { SaveStatusIndicator } from '@/components/settings/save-status-indicator'
import type { NewsletterData } from '@/types/newsletter'
import type { NewsletterStatus } from '@/lib/newsletter/types'

import { markdownComponents } from './newsletter-markdown-components'

interface NewsletterReportPhaseProps {
  videoId: string
  newsletterData: NewsletterData
  defaultFormatPrompt: string
  onStatusChange?: (status: NewsletterStatus) => void
}

export function NewsletterReportPhase({ videoId, newsletterData, defaultFormatPrompt, onStatusChange }: NewsletterReportPhaseProps) {
  const {
    report,
    formatPrompt,
    isGenerating,
    error,
    generate,
    saveReport,
    setFormatPrompt,
    retry,
  } = useNewsletterReport(videoId, newsletterData, defaultFormatPrompt)

  const hasReport = report !== null && report !== ''

  // Local editor state
  const [localReport, setLocalReport] = useState(report ?? '')
  const hasUserEdited = useRef(false)

  // Prompt editor only shown when user explicitly clicks "Alterar Prompt"
  const [showPromptEditor, setShowPromptEditor] = useState(false)

  // Auto-generate when arriving at phase 4 with no report
  const autoGenerateTriggeredRef = useRef(false)

  useEffect(() => {
    autoGenerateTriggeredRef.current = false
  }, [videoId])

  useEffect(() => {
    if (
      !hasReport && !isGenerating && !error
      && formatPrompt.trim()
      && !autoGenerateTriggeredRef.current
    ) {
      autoGenerateTriggeredRef.current = true
      generate(formatPrompt)
        .then((ok) => { if (ok) onStatusChange?.('completed') })
        .catch(() => { /* error handled by hook state */ })
    }
  }, [hasReport, isGenerating, error, formatPrompt, generate, onStatusChange])

  // Auto-save (must be before sync useEffect that uses resetValue)
  const saveReportCallback = useCallback(
    async (value: string) => {
      await saveReport(value)
    },
    [saveReport]
  )
  const { saveStatus, resetValue } = useAutoSave(localReport, saveReportCallback, 1500)

  // Sync from hook report to local state (only if user hasn't started editing)
  useEffect(() => {
    if (report !== null && !hasUserEdited.current) {
      setLocalReport(report)
      resetValue(report)
      setShowPromptEditor(false)
    }
  }, [report, resetValue])

  // Debounced preview (500ms)
  const [debouncedReport, setDebouncedReport] = useState(report ?? '')
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }
    previewTimeoutRef.current = setTimeout(() => {
      setDebouncedReport(localReport)
    }, 500)
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current)
      }
    }
  }, [localReport])

  const handleGenerate = useCallback(async () => {
    hasUserEdited.current = false
    const ok = await generate(formatPrompt)
    if (ok) {
      onStatusChange?.('completed')
    }
  }, [generate, formatPrompt, onStatusChange])

  const handleRegenerate = useCallback(() => {
    setShowPromptEditor(true)
  }, [])

  // Scroll sync between editor and preview
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

  // Generating state
  if (isGenerating) {
    return (
      <div data-testid="newsletter-report-generating" className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Gerando relatório final...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div data-testid="newsletter-report-error" className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={retry}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  // Prompt editor state (only when user explicitly clicked "Alterar Prompt")
  if (showPromptEditor) {
    return (
      <div data-testid="newsletter-report-prompt" className="flex flex-col items-center justify-center h-full gap-4 px-8">
        <p className="text-sm text-muted-foreground text-center">
          Configure o prompt de formato e clique para gerar o relatório final da newsletter.
        </p>
        <textarea
          data-testid="newsletter-format-prompt"
          className="w-full max-w-2xl h-40 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none custom-scrollbar"
          placeholder="Descreva como o relatório deve ser formatado..."
          value={formatPrompt}
          onChange={(e) => setFormatPrompt(e.target.value)}
        />
        <Button
          data-testid="newsletter-generate-report-btn"
          onClick={handleGenerate}
          disabled={!formatPrompt.trim()}
        >
          Gerar Relatório
        </Button>
      </div>
    )
  }

  // No report yet (auto-generate in progress or about to start)
  if (!hasReport) {
    return (
      <div data-testid="newsletter-report-auto-generating" className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Preparando geração do relatório...</p>
      </div>
    )
  }

  // Result state — editor + preview
  return (
    <div data-testid="newsletter-report-result" className="flex flex-col h-full">
      {/* Header with actions */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-medium">Editor</h4>
          <SaveStatusIndicator status={saveStatus} />
        </div>
        <Button size="sm" variant="outline" onClick={handleRegenerate}>
          Alterar Prompt
        </Button>
      </div>

      {/* Editor + Preview side by side */}
      <div className="flex flex-1 min-h-0">
        {/* Editor */}
        <div className="flex-1 flex flex-col border-r border-border">
          <textarea
            ref={editorRef}
            data-testid="newsletter-report-editor"
            aria-label="Editor do relatório da newsletter"
            className="flex-1 resize-none p-4 bg-background text-foreground text-sm font-mono focus:outline-none custom-scrollbar"
            value={localReport}
            onChange={(e) => { hasUserEdited.current = true; setLocalReport(e.target.value) }}
            onScroll={handleEditorScroll}
          />
        </div>
        {/* Preview */}
        <div
          ref={previewRef}
          data-testid="newsletter-report-preview"
          className="flex-1 overflow-y-auto custom-scrollbar p-4 text-sm leading-relaxed"
          onScroll={handlePreviewScroll}
        >
          <Markdown components={markdownComponents}>{debouncedReport}</Markdown>
        </div>
      </div>
    </div>
  )
}
