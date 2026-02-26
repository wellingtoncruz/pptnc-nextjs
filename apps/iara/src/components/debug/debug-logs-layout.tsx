'use client'

import { useEffect, useState } from 'react'
import { Bug } from 'lucide-react'

import type { LlmLogEntry } from '@/types/llm-log'

import { DebugLogsList } from './debug-logs-list'

/**
 * Full-page layout for the Depuração (Debug) tab.
 * Fetches LLM debug logs from the API and renders them.
 */
export function DebugLogsLayout() {
  const [logs, setLogs] = useState<LlmLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLogs() {
      try {
        setIsLoading(true)
        const response = await fetch('/api/llm-logs?limit=200')
        if (!response.ok) {
          const errorMessages: Record<number, string> = {
            401: 'Sessão expirada. Faça login novamente.',
            403: 'Acesso negado. Apenas administradores podem visualizar logs.',
          }
          throw new Error(errorMessages[response.status] ?? 'Falha ao carregar logs')
        }
        const result = await response.json()
        setLogs(result.data?.logs ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      } finally {
        setIsLoading(false)
      }
    }

    fetchLogs()
  }, [])

  return (
    <div data-testid="debug-logs-layout" className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Bug className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Depuração LLM</h1>
        <span className="text-sm text-muted-foreground">
          {!isLoading && !error && `${logs.length} log${logs.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!isLoading && !error && <DebugLogsList logs={logs} />}
      </div>
    </div>
  )
}
