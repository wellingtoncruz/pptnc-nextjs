'use client'

import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { LLMProviderId } from '@/lib/llm/models'
import type { CostEstimate } from '@/lib/llm/cost-estimator'

interface CostEstimateBadgeProps {
  provider: LLMProviderId
  model: string
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`
}

const THRESHOLD_STYLES: Record<CostEstimate['threshold'], string> = {
  safe: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  danger: 'bg-red-500/10 text-red-400 border-red-500/30',
}

const THRESHOLD_LABEL: Record<CostEstimate['threshold'], string> = {
  safe: 'Custo baixo',
  warning: 'Atenção ao custo',
  danger: 'Custo elevado',
}

export function CostEstimateBadge({ provider, model }: CostEstimateBadgeProps) {
  const [estimate, setEstimate] = useState<CostEstimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({ provider, model })
    fetch(`/api/podcast/cost-estimate?${params}`)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((json) => {
        if (cancelled) return
        setEstimate(json.data as CostEstimate)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'unknown')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [provider, model])

  if (loading) {
    return <div className="text-xs text-muted-foreground">Calculando custo estimado...</div>
  }

  if (error || !estimate) {
    return <div className="text-xs text-muted-foreground">Custo estimado indisponível</div>
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium cursor-help',
              THRESHOLD_STYLES[estimate.threshold]
            )}
          >
            <span>Estimativa mensal: {formatUsd(estimate.monthlyUsd)}/mês</span>
            <span className="opacity-60">·</span>
            <span className="opacity-80">{THRESHOLD_LABEL[estimate.threshold]}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1.5">
            <div className="font-medium">Breakdown por tipo de vídeo</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              <span>Episódios</span>
              <span className="text-right">{formatUsd(estimate.breakdown.episode)}</span>
              <span>Cortes</span>
              <span className="text-right">{formatUsd(estimate.breakdown.cut)}</span>
              <span>Reels</span>
              <span className="text-right">{formatUsd(estimate.breakdown.reel)}</span>
            </div>
            <div className="pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
              {estimate.source === 'actual'
                ? `Baseado no histórico real dos últimos 30 dias.`
                : `Baseado em volumes típicos PPTNC (sem histórico real disponível).`}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
