'use client'

import { WEEK_SCOPES, type WeekScope } from '@/lib/analytics/weekly'
import { cn } from '@/lib/utils'

/** Rótulos em PT-BR dos três escopos da D4. `last-12-weeks` substituiu "último
 * mês" porque 4 pontos não formam tendência num gráfico de área. */
export const SCOPE_LABELS: Record<WeekScope, string> = {
  'last-12-weeks': 'Últimas 12 semanas',
  'year-to-date': 'Desde o começo do ano',
  'all-time': 'Todo o período',
}

interface ScopeSelectorProps {
  value: WeekScope
  onChange: (scope: WeekScope) => void
  /** Nome da linha do 2×2 que este seletor controla — vira rótulo acessível. */
  label: string
}

/**
 * Seletor de escopo de UMA linha do 2×2 (D4): controla os dois gráficos dela.
 *
 * A troca é filtro de APRESENTAÇÃO sobre semanas já formadas — não refaz busca
 * ao servidor, porque os dados chegam completos do Server Component.
 */
export function ScopeSelector({ value, onChange, label }: ScopeSelectorProps) {
  return (
    <div
      role="group"
      aria-label={`Período — ${label}`}
      className="inline-flex rounded-md border border-border bg-background p-0.5"
    >
      {WEEK_SCOPES.map((scope) => {
        const active = scope === value
        return (
          <button
            key={scope}
            type="button"
            onClick={() => onChange(scope)}
            aria-pressed={active}
            className={cn(
              'rounded px-3 py-1 text-xs transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {SCOPE_LABELS[scope]}
          </button>
        )
      })}
    </div>
  )
}
