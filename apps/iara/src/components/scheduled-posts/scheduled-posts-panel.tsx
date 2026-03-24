'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2,
  RefreshCw, Trash2, XCircle, AlertTriangle, Linkedin,
} from 'lucide-react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// =============================================================================
// Types
// =============================================================================

interface ScheduledPostItem {
  id: string
  sourceType: string
  sourceId: string
  content: string
  firstComment?: string
  imageUrl?: string
  network: string
  status: string
  scheduledAt: unknown
  publishedAt?: unknown
  externalPostId?: string
  error?: string
  dismissed: boolean
}

// =============================================================================
// Helpers
// =============================================================================

function parseDate(value: unknown): Date | null {
  if (!value) return null
  if (typeof value === 'string') return new Date(value)
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    return new Date((value as { _seconds: number })._seconds * 1000)
  }
  return null
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const DAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const STATUS_CONFIG: Record<string, { label: string; dotColor: string; bgColor: string; textColor: string; icon: typeof Clock }> = {
  scheduled:           { label: 'Agendado',     dotColor: 'bg-blue-400',   bgColor: 'bg-blue-500/10',   textColor: 'text-blue-400',           icon: Clock },
  publishing:          { label: 'Publicando',   dotColor: 'bg-yellow-400', bgColor: 'bg-yellow-500/10', textColor: 'text-yellow-400',         icon: Loader2 },
  published:           { label: 'Publicado',    dotColor: 'bg-green-400',  bgColor: 'bg-green-500/10',  textColor: 'text-green-400',          icon: CheckCircle2 },
  partially_published: { label: 'Parcial',      dotColor: 'bg-orange-400', bgColor: 'bg-orange-500/10', textColor: 'text-orange-400',         icon: AlertTriangle },
  failed:              { label: 'Falhou',       dotColor: 'bg-red-400',    bgColor: 'bg-red-500/10',    textColor: 'text-red-400',            icon: XCircle },
  cancelled:           { label: 'Cancelado',    dotColor: 'bg-muted-foreground', bgColor: 'bg-muted/30', textColor: 'text-muted-foreground', icon: XCircle },
}

const NETWORK_ICONS: Record<string, typeof Linkedin> = { linkedin: Linkedin }

// =============================================================================
// Calendar Grid Builder
// =============================================================================

interface CalendarDay {
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
  posts: ScheduledPostItem[]
}

function buildCalendarGrid(year: number, month: number, items: ScheduledPostItem[]): CalendarDay[] {
  const today = new Date()
  const firstDay = new Date(year, month, 1)
  // Monday = 0 ... Sunday = 6
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Build lookup: day number → posts
  const postsByDay: Record<number, ScheduledPostItem[]> = {}
  for (const item of items) {
    const d = parseDate(item.scheduledAt)
    if (!d) continue
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!postsByDay[day]) postsByDay[day] = []
      postsByDay[day].push(item)
    }
  }

  const days: CalendarDay[] = []

  // Previous month padding
  const prevMonthDays = new Date(year, month, 0).getDate()
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push({
      date: new Date(year, month - 1, prevMonthDays - i),
      isCurrentMonth: false,
      isToday: false,
      posts: [],
    })
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    days.push({
      date,
      isCurrentMonth: true,
      isToday: date.toDateString() === today.toDateString(),
      posts: postsByDay[d] || [],
    })
  }

  // Next month padding (fill to 6 rows = 42 cells, or 5 rows = 35 if fits)
  const targetCells = days.length > 35 ? 42 : 35
  let nextDay = 1
  while (days.length < targetCells) {
    days.push({
      date: new Date(year, month + 1, nextDay++),
      isCurrentMonth: false,
      isToday: false,
      posts: [],
    })
  }

  return days
}

// =============================================================================
// Mini Card (inside calendar cell)
// =============================================================================

function PostMiniCard({ item, onClick }: { item: ScheduledPostItem; onClick: () => void }) {
  const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.scheduled
  const NetworkIcon = NETWORK_ICONS[item.network] || Linkedin
  const d = parseDate(item.scheduledAt)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-md px-2 py-1.5 text-left transition-all',
        'hover:ring-1 hover:ring-primary/40 hover:brightness-110',
        'flex items-center gap-1.5 group',
        status.bgColor,
      )}
    >
      <span className={cn('size-1.5 rounded-full shrink-0', status.dotColor)} />
      <NetworkIcon className="size-3 shrink-0 text-blue-400/70" />
      <span className={cn('text-[10px] font-medium shrink-0', status.textColor)}>
        {d ? formatTime(d) : '—'}
      </span>
      <span className="text-[10px] text-muted-foreground truncate flex-1 group-hover:text-foreground transition-colors">
        {item.content.slice(0, 30)}
      </span>
    </button>
  )
}

// =============================================================================
// Detail Dialog
// =============================================================================

function PostDetailDialog({
  item,
  open,
  onOpenChange,
  onCancel,
  onDismiss,
}: {
  item: ScheduledPostItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancel: (id: string) => void
  onDismiss: (id: string) => void
}) {
  if (!item) return null

  const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.scheduled
  const StatusIcon = status.icon
  const NetworkIcon = NETWORK_ICONS[item.network] || Linkedin
  const scheduledDate = parseDate(item.scheduledAt)
  const canCancel = item.status === 'scheduled'
  const canDismiss = ['published', 'failed', 'partially_published', 'cancelled'].includes(item.status)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <NetworkIcon className="size-5 text-blue-500" />
            Detalhes do Agendamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status + Date */}
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className={cn('gap-1.5', status.bgColor, status.textColor)}>
              <StatusIcon className={cn('size-3', item.status === 'publishing' && 'animate-spin')} />
              {status.label}
            </Badge>
            {scheduledDate && (
              <span className="text-xs text-muted-foreground">{formatFullDate(scheduledDate)}</span>
            )}
          </div>

          {/* Error */}
          {item.error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
              {item.error}
            </div>
          )}

          {/* Content */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Conteúdo da publicação</p>
            <div className="rounded-md bg-muted/30 border border-border/50 p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar leading-relaxed">
              {item.content}
            </div>
          </div>

          {/* First Comment */}
          {item.firstComment && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">Primeiro comentário</p>
              <div className="rounded-md bg-muted/30 border border-border/50 p-3 text-sm whitespace-pre-wrap leading-relaxed">
                {item.firstComment}
              </div>
            </div>
          )}

          {/* External Post ID */}
          {item.externalPostId && (
            <p className="text-xs text-muted-foreground">
              Post ID: <span className="font-mono text-foreground/70">{item.externalPostId}</span>
            </p>
          )}

          {/* Actions */}
          {(canCancel || canDismiss) && (
            <div className="flex gap-2 pt-2 border-t border-border/50">
              {canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { onCancel(item.id); onOpenChange(false) }}
                  className="text-xs"
                >
                  Cancelar agendamento
                </Button>
              )}
              {canDismiss && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { onDismiss(item.id); onOpenChange(false) }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="size-3 mr-1" />
                  Dispensar
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// Main Panel — Calendar View
// =============================================================================

export function ScheduledPostsPanel() {
  const [items, setItems] = useState<ScheduledPostItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Calendar navigation
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  // Dialogs
  const [selectedPost, setSelectedPost] = useState<ScheduledPostItem | null>(null)
  const [cancelDialogId, setCancelDialogId] = useState<string | null>(null)

  // Fetch
  const fetchItems = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/scheduled-posts')
      if (response.ok) {
        const data = await response.json()
        setItems(data.data?.items || [])
      }
    } catch { /* silently fail */ }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Calendar grid
  const calendarDays = useMemo(
    () => buildCalendarGrid(viewYear, viewMonth, items),
    [viewYear, viewMonth, items]
  )

  // Count posts in current month
  const monthPostCount = useMemo(
    () => calendarDays.filter(d => d.isCurrentMonth && d.posts.length > 0).reduce((sum, d) => sum + d.posts.length, 0),
    [calendarDays]
  )

  // Navigation
  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else { setViewMonth(m => m - 1) }
  }
  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else { setViewMonth(m => m + 1) }
  }
  const goToToday = () => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
  }

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  // Actions
  const handleCancelConfirm = useCallback(async () => {
    if (!cancelDialogId) return
    try {
      const response = await fetch(`/api/scheduled-posts/${cancelDialogId}/cancel`, { method: 'POST' })
      if (response.ok) {
        setItems(prev => prev.map(item =>
          item.id === cancelDialogId ? { ...item, status: 'cancelled' } : item
        ))
      }
    } catch { /* silently fail */ }
    finally { setCancelDialogId(null) }
  }, [cancelDialogId])

  const handleDismiss = useCallback(async (postId: string) => {
    try {
      const response = await fetch(`/api/scheduled-posts/${postId}/dismiss`, { method: 'PATCH' })
      if (response.ok) {
        setItems(prev => prev.filter(item => item.id !== postId))
      }
    } catch { /* silently fail */ }
  }, [])

  const handleCancelRequest = useCallback((id: string) => {
    setCancelDialogId(id)
  }, [])

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full flex-col" data-testid="scheduled-posts-panel">
        {/* ── Header ── */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={goToPrevMonth} aria-label="Mês anterior" className="size-8">
                <ChevronLeft className="size-4" />
              </Button>
              <h2 className="text-lg font-semibold min-w-[180px] text-center">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </h2>
              <Button variant="ghost" size="icon" onClick={goToNextMonth} aria-label="Próximo mês" className="size-8">
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {!isCurrentMonth && (
              <Button variant="outline" size="sm" onClick={goToToday} className="text-xs h-7">
                Hoje
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {monthPostCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {monthPostCount} agendamento{monthPostCount !== 1 ? 's' : ''} neste mês
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={fetchItems} aria-label="Atualizar" className="size-8">
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>

        {/* ── Day Headers ── */}
        <div className="shrink-0 grid grid-cols-7 border-b border-border">
          {DAY_NAMES.map((name) => (
            <div key={name} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {name}
            </div>
          ))}
        </div>

        {/* ── Calendar Grid ── */}
        <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden">
          {calendarDays.map((day, i) => (
            <div
              key={i}
              className={cn(
                'border-b border-r border-border/50 p-1.5 flex flex-col gap-1 overflow-hidden',
                !day.isCurrentMonth && 'bg-muted/20',
                day.isToday && 'bg-primary/5',
                // Right border removal on last column
                (i + 1) % 7 === 0 && 'border-r-0',
              )}
            >
              {/* Day number */}
              <span className={cn(
                'text-xs font-medium px-1 self-start',
                !day.isCurrentMonth && 'text-muted-foreground/40',
                day.isToday && 'text-primary font-bold',
                day.isCurrentMonth && !day.isToday && 'text-muted-foreground',
              )}>
                {day.isToday ? (
                  <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {day.date.getDate()}
                  </span>
                ) : (
                  day.date.getDate()
                )}
              </span>

              {/* Post cards */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
                {day.posts.map((post) => (
                  <PostMiniCard
                    key={post.id}
                    item={post}
                    onClick={() => setSelectedPost(post)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Empty state overlay ── */}
        {items.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <CalendarClock className="size-16 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/40 mt-3 font-medium">Nenhum agendamento</p>
            <p className="text-xs text-muted-foreground/30 mt-1">
              Agende publicações a partir do workspace de notícias
            </p>
          </div>
        )}
      </div>

      {/* ── Post Detail Dialog ── */}
      <PostDetailDialog
        item={selectedPost}
        open={!!selectedPost}
        onOpenChange={(open) => !open && setSelectedPost(null)}
        onCancel={handleCancelRequest}
        onDismiss={handleDismiss}
      />

      {/* ── Cancel Confirmation Dialog ── */}
      <AlertDialog open={!!cancelDialogId} onOpenChange={(open) => !open && setCancelDialogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-orange-500" />
              Cancelar Agendamento
            </AlertDialogTitle>
            <AlertDialogDescription>
              A publicação agendada será cancelada e não será enviada para a rede social.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter agendamento</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              className="bg-destructive hover:bg-destructive/90"
            >
              Cancelar agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
