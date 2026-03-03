'use client'

import { cn } from '@/lib/utils'

const PHASE_LABELS = ['Notícia', 'Episódios', 'Redação'] as const

interface NewsPhaseNavProps {
  currentPhase: number
  maxReachablePhase: number
  onPhaseChange: (phase: number) => void
}

export function NewsPhaseNav({ currentPhase, maxReachablePhase, onPhaseChange }: NewsPhaseNavProps) {
  return (
    <nav aria-label="Fases do workspace" data-testid="news-phase-nav" className="flex items-center gap-2 px-5 py-3 border-b border-border">
      {PHASE_LABELS.map((label, index) => {
        const phase = index + 1
        const isActive = phase === currentPhase
        const isReachable = phase <= maxReachablePhase
        const isDisabled = !isReachable

        return (
          <div key={phase} className="flex items-center gap-2">
            {index > 0 && (
              <span className="text-muted-foreground/40 text-xs" aria-hidden="true">→</span>
            )}
            <button
              type="button"
              data-testid={`news-phase-${phase}`}
              aria-current={isActive ? 'step' : undefined}
              disabled={isDisabled}
              onClick={() => onPhaseChange(phase)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive && 'bg-primary text-primary-foreground',
                !isActive && isReachable && 'bg-accent text-accent-foreground hover:bg-accent/80 cursor-pointer',
                isDisabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/10 text-xs">
                {phase}
              </span>
              {label}
            </button>
          </div>
        )
      })}
    </nav>
  )
}
