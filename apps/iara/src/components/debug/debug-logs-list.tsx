'use client'

import { useMemo } from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

import type { LlmLogEntry } from '@/types/llm-log'

import { DebugLogEntry } from './debug-log-entry'

interface DebugLogsListProps {
  logs: LlmLogEntry[]
}

/**
 * Groups logs by day and renders them in an accordion.
 * Each day shows a count badge and expands to reveal individual log entries.
 */
export function DebugLogsList({ logs }: DebugLogsListProps) {
  // Group logs by day (most recent first)
  const groupedByDay = useMemo(() => {
    const groups: Record<string, LlmLogEntry[]> = {}

    for (const log of logs) {
      const date = log.createdAt ? new Date(log.createdAt) : new Date()
      const dayKey = date.toLocaleDateString('pt-BR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

      if (!groups[dayKey]) {
        groups[dayKey] = []
      }
      groups[dayKey].push(log)
    }

    // Return as array of [dayLabel, logs[]] sorted by most recent first
    return Object.entries(groups)
  }, [logs])

  if (logs.length === 0) {
    return (
      <div data-testid="debug-logs-empty" className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">
          Nenhum log encontrado. Ative o Modo de Depuração LLM em Configurações → Recursos.
        </p>
      </div>
    )
  }

  return (
    <Accordion type="multiple" defaultValue={groupedByDay.length > 0 ? [groupedByDay[0][0]] : []}>
      {groupedByDay.map(([dayLabel, dayLogs]) => (
        <AccordionItem key={dayLabel} value={dayLabel}>
          <AccordionTrigger className="text-sm">
            <div className="flex items-center gap-3">
              <span className="capitalize">{dayLabel}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {dayLogs.length} chamada{dayLogs.length !== 1 ? 's' : ''}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-2">
              {dayLogs.map((log) => (
                <DebugLogEntry key={log.id} log={log} />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
