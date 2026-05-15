'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bug, DollarSign } from 'lucide-react'

import type { LlmLogEntry } from '@/types/llm-log'

import { DebugLogsList } from './debug-logs-list'

const ALL = '__all__'

function selectClass() {
  return 'rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
}

/**
 * Full-page layout for the Depuração (Debug) tab.
 * Fetches LLM debug logs from the API, exibe filtros (provider/model/component)
 * e o total de custo no período carregado.
 */
export function DebugLogsLayout() {
  const [logs, setLogs] = useState<LlmLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [providerFilter, setProviderFilter] = useState<string>(ALL)
  const [modelFilter, setModelFilter] = useState<string>(ALL)
  const [componentFilter, setComponentFilter] = useState<string>(ALL)

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

  const availableModels = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.model))).sort()
  }, [logs])

  const availableComponents = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.component))).sort()
  }, [logs])

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (providerFilter !== ALL && log.provider !== providerFilter) return false
      if (modelFilter !== ALL && log.model !== modelFilter) return false
      if (componentFilter !== ALL && log.component !== componentFilter) return false
      return true
    })
  }, [logs, providerFilter, modelFilter, componentFilter])

  const totalCostUsd = useMemo(() => {
    return filteredLogs.reduce((sum, log) => sum + (log.estimatedCostUsd || 0), 0)
  }, [filteredLogs])

  const formatCost = (value: number): string => {
    if (value === 0) return '$0.00'
    if (value < 0.01) return '<$0.01'
    return `$${value.toFixed(2)}`
  }

  return (
    <div data-testid="debug-logs-layout" className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
        <Bug className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Depuração LLM</h1>
        {!isLoading && !error && (
          <>
            <span className="text-sm text-muted-foreground">
              {filteredLogs.length} de {logs.length} log{logs.length !== 1 ? 's' : ''}
            </span>
            <div className="ml-auto flex items-center gap-1 rounded-md bg-muted/50 px-2.5 py-1 text-xs">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Total no período:</span>
              <span className="font-medium">{formatCost(totalCostUsd)}</span>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      {!isLoading && !error && logs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-6 py-3 text-xs">
          <span className="text-muted-foreground">Filtrar por:</span>
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Provider</span>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className={selectClass()}
              data-testid="filter-provider"
            >
              <option value={ALL}>Todos</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Modelo</span>
            <select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className={selectClass()}
              data-testid="filter-model"
            >
              <option value={ALL}>Todos</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Componente</span>
            <select
              value={componentFilter}
              onChange={(e) => setComponentFilter(e.target.value)}
              className={selectClass()}
              data-testid="filter-component"
            >
              <option value={ALL}>Todos</option>
              {availableComponents.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      )}

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

        {!isLoading && !error && <DebugLogsList logs={filteredLogs} />}
      </div>
    </div>
  )
}
