import { cn } from '@/lib/utils'
import type { LLMProviderId } from '@/lib/llm/models'

interface ProviderIndicatorProps {
  provider: LLMProviderId
  model: string
  isCollapsed: boolean
}

function GeminiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0c0 6.627 5.373 12 12 12-6.627 0-12 5.373-12 12 0-6.627-5.373-12-12-12 6.627 0 12-5.373 12-12z" />
    </svg>
  )
}

function AnthropicMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M6.5 4 1 20h3.6l1.1-3.4h5.6L12.4 20H16L10.5 4h-4Zm.1 9.6 1.9-5.8 1.9 5.8H6.6ZM18.4 4h-3.6L20.3 20H24L18.4 4Z" />
    </svg>
  )
}

export function ProviderIndicator({ provider, model, isCollapsed }: ProviderIndicatorProps) {
  const Mark = provider === 'claude' ? AnthropicMark : GeminiMark
  const label = provider === 'claude' ? model : model

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-1.5 text-muted-foreground/60',
        isCollapsed ? 'py-1' : 'pb-3'
      )}
      title={`${provider === 'claude' ? 'Anthropic' : 'Google'} · ${model}`}
    >
      <Mark className="h-3.5 w-3.5 shrink-0" />
      {!isCollapsed && (
        <span className="text-[10px] font-medium tracking-wide truncate">{label}</span>
      )}
    </div>
  )
}
