'use client'

import { useEffect, useRef } from 'react'
import { AlertCircle, CheckCircle, Info, Loader2, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { AlertSeverity, ConsoleMessage } from '@/lib/wizard'

interface ConsoleAreaProps {
  messages: ConsoleMessage[]
  className?: string
}

/**
 * Console area component that displays stacked messages.
 *
 * Shows:
 * - Spinners during processing
 * - Alerts after completion (info, success, warning, error)
 *
 * Messages are stacked and scroll automatically to the latest.
 */
export function ConsoleArea({ messages, className }: ConsoleAreaProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <p className="text-sm text-muted-foreground">
          As mensagens de processamento aparecerão aqui.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={scrollContainerRef}
      className={cn('h-full overflow-y-auto', className)}
    >
      <div className="space-y-3 p-4">
        {messages.map((message) => (
          <ConsoleMessageItem key={message.id} message={message} />
        ))}
        {/* Invisible element to scroll into view */}
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </div>
  )
}

/**
 * Individual console message item.
 */
function ConsoleMessageItem({ message }: { message: ConsoleMessage }) {
  if (message.type === 'spinner') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
        <Loader2 className="h-5 w-5 text-blue-400 animate-spin shrink-0" />
        <p className="text-sm text-blue-200">{message.spinnerText}</p>
      </div>
    )
  }

  // Alert message
  const { icon: Icon, colors } = getAlertStyles(message.alertSeverity ?? 'info')

  return (
    <div className={cn('rounded-lg border p-3', colors.container)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', colors.icon)} />
        <div className="space-y-1 min-w-0">
          <h4 className={cn('font-medium text-sm', colors.title)}>
            {message.alertTitle}
          </h4>
          {message.alertText && (
            <p className={cn('text-sm whitespace-pre-wrap', colors.text)}>
              {message.alertText}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Get styles for alert based on severity.
 */
function getAlertStyles(severity: AlertSeverity) {
  switch (severity) {
    case 'success':
      return {
        icon: CheckCircle,
        colors: {
          container: 'border-green-500/30 bg-green-500/10',
          icon: 'text-green-400',
          title: 'text-green-200',
          text: 'text-green-200/80',
        },
      }
    case 'warning':
      return {
        icon: AlertCircle,
        colors: {
          container: 'border-yellow-500/30 bg-yellow-500/10',
          icon: 'text-yellow-400',
          title: 'text-yellow-200',
          text: 'text-yellow-200/80',
        },
      }
    case 'error':
      return {
        icon: XCircle,
        colors: {
          container: 'border-red-500/30 bg-red-500/10',
          icon: 'text-red-400',
          title: 'text-red-200',
          text: 'text-red-200/80',
        },
      }
    case 'info':
    default:
      return {
        icon: Info,
        colors: {
          container: 'border-blue-500/30 bg-blue-500/10',
          icon: 'text-blue-400',
          title: 'text-blue-200',
          text: 'text-blue-200/80',
        },
      }
  }
}
