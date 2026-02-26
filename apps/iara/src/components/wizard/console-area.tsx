'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle, ChevronDownIcon, ChevronRightIcon, Info, Loader2, XCircle } from 'lucide-react'

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
 * Messages are displayed in REVERSE order (newest at top) for better UX.
 * New alerts have a brief attention-grabbing animation.
 * Older alerts auto-collapse when new ones arrive, but can be expanded manually.
 *
 * @pattern CONSOLE_REVERSE_ORDER - Newest messages appear at the top
 * @pattern CONSOLE_ALERT_ANIMATION - New alerts blink/pulse to grab attention
 * @pattern CONSOLE_AUTO_COLLAPSE - Older messages collapse when new ones arrive (AC5)
 */
export function ConsoleArea({ messages, className }: ConsoleAreaProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevMessagesLengthRef = useRef(messages.length)
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set())
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  // Track new messages for animation and auto-collapse old ones
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      // Find new messages (they're at the end of the array)
      const newIds = new Set<string>()
      for (let i = prevMessagesLengthRef.current; i < messages.length; i++) {
        newIds.add(messages[i].id)
      }
      setNewMessageIds(newIds)

      // Auto-collapse all existing alert messages (not spinners)
      setCollapsedIds(prev => {
        const updated = new Set(prev)
        for (let i = 0; i < prevMessagesLengthRef.current; i++) {
          const msg = messages[i]
          if (msg.type === 'alert') {
            updated.add(msg.id)
          }
        }
        return updated
      })

      // Clear animation after 1.5 seconds
      const timer = setTimeout(() => {
        setNewMessageIds(new Set())
      }, 1500)

      return () => clearTimeout(timer)
    }
    prevMessagesLengthRef.current = messages.length
  }, [messages])

  // Scroll to top when new messages arrive (since newest is at top)
  useEffect(() => {
    if (scrollContainerRef.current && messages.length > 0 && typeof scrollContainerRef.current.scrollTo === 'function') {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [messages.length])

  // Toggle collapse state for a message
  const toggleCollapse = useCallback((messageId: string) => {
    setCollapsedIds(prev => {
      const updated = new Set(prev)
      if (updated.has(messageId)) {
        updated.delete(messageId)
      } else {
        updated.add(messageId)
      }
      return updated
    })
  }, [])

  if (messages.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <p className="text-sm text-muted-foreground">
          As mensagens de processamento aparecerão aqui.
        </p>
      </div>
    )
  }

  // Reverse the array to show newest first
  const reversedMessages = [...messages].reverse()

  return (
    <div
      ref={scrollContainerRef}
      className={cn('h-full overflow-y-auto custom-scrollbar', className)}
    >
      <div className="space-y-3 p-4">
        {reversedMessages.map((message) => (
          <ConsoleMessageItem
            key={message.id}
            message={message}
            isNew={newMessageIds.has(message.id)}
            isCollapsed={collapsedIds.has(message.id)}
            onToggleCollapse={() => toggleCollapse(message.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface ConsoleMessageItemProps {
  message: ConsoleMessage
  isNew?: boolean
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}

/**
 * Individual console message item.
 *
 * @param isNew - Whether this is a newly added message (triggers attention animation)
 * @param isCollapsed - Whether the alert text is hidden (AC5)
 * @param onToggleCollapse - Callback to toggle collapsed state
 */
function ConsoleMessageItem({
  message,
  isNew = false,
  isCollapsed = false,
  onToggleCollapse,
}: ConsoleMessageItemProps) {
  // Animation class for new alerts (not spinners)
  const newAlertAnimation = isNew && message.type === 'alert'
    ? 'animate-pulse ring-2 ring-offset-2 ring-offset-background'
    : ''

  if (message.type === 'spinner') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
        <Loader2 className="h-5 w-5 text-blue-400 animate-spin shrink-0" />
        <p className="text-sm text-blue-200">{message.spinnerText}</p>
      </div>
    )
  }

  // Alert message
  const { icon: Icon, colors, ringColor } = getAlertStyles(message.alertSeverity ?? 'info')
  const hasText = Boolean(message.alertText)

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-all duration-300',
        colors.container,
        newAlertAnimation,
        isNew && ringColor,
        hasText && 'cursor-pointer'
      )}
      onClick={hasText ? onToggleCollapse : undefined}
      role={hasText ? 'button' : undefined}
      tabIndex={hasText ? 0 : undefined}
      onKeyDown={hasText ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggleCollapse?.()
        }
      } : undefined}
      aria-expanded={hasText ? !isCollapsed : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Collapse indicator for alerts with text */}
        {hasText && (
          <button
            className={cn('shrink-0 mt-0.5 p-0.5 -ml-0.5 rounded hover:bg-white/10', colors.icon)}
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse?.()
            }}
            aria-label={isCollapsed ? 'Expandir' : 'Colapsar'}
          >
            {isCollapsed ? (
              <ChevronRightIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )}
          </button>
        )}
        <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', colors.icon)} />
        <div className="space-y-1 min-w-0 flex-1">
          <h4 className={cn('font-medium text-sm', colors.title)}>
            {message.alertTitle}
          </h4>
          {message.alertText && !isCollapsed && (
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
 *
 * @pattern CONSOLE_ALERT_STYLES - Each severity has distinct colors and ring for animation
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
        ringColor: 'ring-green-500/50',
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
        ringColor: 'ring-yellow-500/50',
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
        ringColor: 'ring-red-500/50',
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
        ringColor: 'ring-blue-500/50',
      }
  }
}
