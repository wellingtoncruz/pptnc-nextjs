import { cn } from '@/lib/utils'

const PHASE_LABELS = ['Draft', 'Notícias', 'Imagem', 'Formato'] as const

/** Fase 2 (Notícias) — a única que o produtor pode pular. */
const NEWS_PHASE = 2

interface NewsletterPhaseNavProps {
  currentPhase: number
  maxReachablePhase: number
  /** Produtor optou por seguir sem notícias: Fase 2 fica marcada como pulada (mas acessível). */
  newsSkipped?: boolean
  onPhaseChange: (phase: number) => void
}

export function NewsletterPhaseNav({ currentPhase, maxReachablePhase, newsSkipped, onPhaseChange }: NewsletterPhaseNavProps) {
  return (
    <nav aria-label="Fases da newsletter" data-testid="newsletter-phase-nav" className="flex items-center gap-2 px-5 py-3 border-b border-border">
      {PHASE_LABELS.map((label, index) => {
        const phase = index + 1
        const isActive = phase === currentPhase
        const isReachable = phase <= maxReachablePhase
        const isDisabled = !isReachable
        const isSkipped = phase === NEWS_PHASE && newsSkipped === true

        return (
          <div key={phase} className="flex items-center gap-2">
            {index > 0 && (
              <span className="text-muted-foreground/40 text-xs" aria-hidden="true">→</span>
            )}
            <button
              type="button"
              data-testid={`phase-${phase}`}
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
              <span className={cn(isSkipped && 'line-through opacity-70')}>{label}</span>
              {isSkipped && (
                <span data-testid="phase-2-skipped" className="text-xs font-normal opacity-70">
                  (pulada)
                </span>
              )}
            </button>
          </div>
        )
      })}
    </nav>
  )
}
