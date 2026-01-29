'use client'

import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

interface ProcessingSpinnerProps {
  /** Optional text to display below the spinner */
  text?: string
  className?: string
}

/**
 * ProcessingSpinner component displays a prominent loading spinner.
 *
 * Used in wizard phases while waiting for LLM processing.
 * Minimum height of 200px as per AC3.
 *
 * @see Story 5.1 - AC3
 */
export function ProcessingSpinner({ text, className }: ProcessingSpinnerProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center min-h-[200px] gap-4',
        className
      )}
    >
      <Loader2 className="size-12 text-primary animate-spin" />
      {text && (
        <p className="text-sm text-muted-foreground text-center">
          {text}
        </p>
      )}
    </div>
  )
}
