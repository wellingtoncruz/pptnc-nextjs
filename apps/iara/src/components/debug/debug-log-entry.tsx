'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Clock, Cpu, Film, Layers, Paperclip, Coins } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { LlmLogEntry } from '@/types/llm-log'

interface DebugLogEntryProps {
  log: LlmLogEntry
}

/**
 * Card for a single LLM debug log entry.
 * Shows metadata in the header and collapsible sections for prompt and response.
 */
export function DebugLogEntry({ log }: DebugLogEntryProps) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [showResponse, setShowResponse] = useState(false)

  const time = log.createdAt
    ? new Date(log.createdAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--:--:--'

  return (
    <Card data-testid="debug-log-entry">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{time}</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            <Layers className="mr-1 h-3 w-3" />
            {log.component}
          </Badge>
          <Badge variant="outline" className="text-xs">
            <Cpu className="mr-1 h-3 w-3" />
            {log.model}
          </Badge>
          <Badge variant="outline" className="text-xs">
            <Film className="mr-1 h-3 w-3" />
            {log.videoType}/{log.videoId}
          </Badge>
          {log.attachment && (
            <Badge variant="outline" className="text-xs">
              <Paperclip className="mr-1 h-3 w-3" />
              {log.attachment.sizeKB.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB (~{log.attachment.estimatedTokens.toLocaleString('pt-BR')} tokens)
            </Badge>
          )}
          {log.usage && (
            <Badge variant="outline" className="text-xs">
              <Coins className="mr-1 h-3 w-3" />
              {log.usage.promptTokens.toLocaleString('pt-BR')} → {log.usage.completionTokens.toLocaleString('pt-BR')} ({log.usage.totalTokens.toLocaleString('pt-BR')} total)
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {/* Prompt section */}
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="flex w-full items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {showPrompt ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Prompt
        </button>
        {showPrompt && (
          <div className="space-y-3 rounded-md bg-muted/50 p-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">System</p>
              <div className="prose prose-sm prose-invert max-w-none text-sm">
                <ReactMarkdown>{log.prompt.system}</ReactMarkdown>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">User</p>
              <div className="prose prose-sm prose-invert max-w-none text-sm">
                <ReactMarkdown>{log.prompt.user}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Response section */}
        <button
          onClick={() => setShowResponse(!showResponse)}
          className="flex w-full items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {showResponse ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Resposta
        </button>
        {showResponse && (
          <div className="rounded-md bg-muted/50 p-3">
            <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
              {log.response}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
