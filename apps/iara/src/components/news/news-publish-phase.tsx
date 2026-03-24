'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Calendar, CheckCircle2, Clock, Linkedin, Loader2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { News } from '@/types/news'

interface LinkedInStatus {
  connected: boolean
  targetName?: string | null
  targetId?: string | null
  targetType?: string | null
}

interface ScheduledPostInfo {
  id: string
  status: string
  scheduledAt: { toDate: () => Date } | string
}

interface VideoData {
  id: string
  spotifyUrl?: string
}

interface NewsPublishPhaseProps {
  news: News
}

/**
 * Generates default first comment with episode links.
 */
function generateDefaultFirstComment(videoId?: string | null, spotifyUrl?: string): string {
  const lines: string[] = []
  if (videoId) {
    lines.push(`▶️ YouTube: https://www.youtube.com/watch?v=${videoId}`)
  }
  if (spotifyUrl) {
    lines.push(`🎵 Spotify: ${spotifyUrl}`)
  }
  return lines.length > 0 ? `🎧 Links do episódio:\n${lines.join('\n')}` : ''
}

/**
 * Generates time slots in 30-minute intervals.
 */
function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slots
}

const TIME_SLOTS = generateTimeSlots()

/**
 * Phase 4 — Publicação / Agendamento.
 *
 * Allows the producer to schedule publication of the social content
 * (from Phase 3) to LinkedIn. Shows preview of content, first comment
 * editor, and date/time picker.
 */
export function NewsPublishPhase({ news }: NewsPublishPhaseProps) {
  const [linkedInStatus, setLinkedInStatus] = useState<LinkedInStatus | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(true)
  const [existingPost, setExistingPost] = useState<ScheduledPostInfo | null>(null)

  const [firstComment, setFirstComment] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('14:00')
  const [isScheduling, setIsScheduling] = useState(false)
  const [scheduleResult, setScheduleResult] = useState<'success' | 'error' | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  const dateInputRef = useRef<HTMLInputElement>(null)

  // Check LinkedIn connection status
  useEffect(() => {
    async function checkStatus() {
      try {
        const response = await fetch('/api/auth/linkedin/status')
        const data = await response.json()
        setLinkedInStatus(data.data)
      } catch {
        setLinkedInStatus({ connected: false })
      } finally {
        setIsLoadingStatus(false)
      }
    }
    checkStatus()
  }, [])

  // Fetch video data for first comment (spotifyUrl) and generate default comment
  useEffect(() => {
    if (!news.selected_video) return

    async function fetchVideoData() {
      try {
        const response = await fetch(`/api/videos/${news.selected_video}`)
        if (response.ok) {
          const data = await response.json()
          const video = data.data as VideoData
          setFirstComment(generateDefaultFirstComment(video.id, video.spotifyUrl))
        } else {
          setFirstComment(generateDefaultFirstComment(news.selected_video))
        }
      } catch {
        setFirstComment(generateDefaultFirstComment(news.selected_video))
      }
    }

    fetchVideoData()
  }, [news.selected_video])

  // Check for existing scheduled post
  useEffect(() => {
    async function checkExisting() {
      try {
        const response = await fetch(`/api/scheduled-posts?sourceId=${news.id}&network=linkedin`)
        if (response.ok) {
          const data = await response.json()
          if (data.data?.items?.length > 0) {
            setExistingPost(data.data.items[0])
          }
        }
      } catch {
        // Ignore — not critical
      }
    }
    checkExisting()
  }, [news.id])

  const handleSchedule = useCallback(async () => {
    if (!selectedDate || !selectedTime || !news.social || !linkedInStatus?.targetId) return

    setIsScheduling(true)
    setScheduleResult(null)
    setScheduleError(null)

    try {
      const scheduledAt = new Date(`${selectedDate}T${selectedTime}:00`).toISOString()

      const response = await fetch('/api/scheduled-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'news',
          sourceId: news.id,
          content: news.social,
          firstComment: firstComment || undefined,
          imageUrl: news.imageUrl || undefined,
          network: 'linkedin',
          networkConfig: {
            targetId: linkedInStatus.targetId,
            targetType: (linkedInStatus.targetType as 'page' | 'profile') || 'profile',
          },
          scheduledAt,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error?.message || 'Erro ao agendar publicação')
      }

      setScheduleResult('success')
    } catch (err) {
      setScheduleResult('error')
      setScheduleError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setIsScheduling(false)
    }
  }, [selectedDate, selectedTime, news, firstComment, linkedInStatus])

  // Open native date picker on click
  const handleDateClick = useCallback(() => {
    dateInputRef.current?.showPicker()
  }, [])

  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0]

  // Check if selected date/time is in the past
  const isScheduleInPast = selectedDate && selectedTime
    ? new Date(`${selectedDate}T${selectedTime}:00`) <= new Date()
    : false

  if (isLoadingStatus) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-5 space-y-6" data-testid="news-publish-phase">
      {/* LinkedIn Card */}
      <div className={cn(
        'rounded-lg border p-5 space-y-4',
        linkedInStatus?.connected ? 'border-border' : 'border-muted opacity-60'
      )}>
        <div className="flex items-center gap-3">
          <Linkedin className="size-5 text-blue-500" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold">
              LinkedIn {linkedInStatus?.targetType === 'page' ? '(Página)' : '(Perfil)'}
            </h3>
            {linkedInStatus?.connected ? (
              <p className="text-xs text-muted-foreground">
                Conectado: {linkedInStatus.targetName}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Conecte sua conta em{' '}
                <a href="/videos?view=settings" className="underline text-primary">
                  Configurações → Redes Sociais
                </a>
              </p>
            )}
          </div>
        </div>

        {linkedInStatus?.connected && (
          <>
            {/* Existing post status */}
            {existingPost && (
              <div className={cn(
                'rounded-md px-3 py-2 text-sm flex items-center gap-2',
                existingPost.status === 'published' && 'bg-green-500/10 text-green-400',
                existingPost.status === 'scheduled' && 'bg-blue-500/10 text-blue-400',
                existingPost.status === 'failed' && 'bg-red-500/10 text-red-400',
              )}>
                {existingPost.status === 'published' && <CheckCircle2 className="size-4" />}
                {existingPost.status === 'failed' && <XCircle className="size-4" />}
                {existingPost.status === 'scheduled' && <Clock className="size-4" />}
                <span>
                  {existingPost.status === 'published' && 'Publicação realizada com sucesso'}
                  {existingPost.status === 'scheduled' && 'Publicação agendada'}
                  {existingPost.status === 'failed' && 'Publicação falhou — reagende'}
                </span>
              </div>
            )}

            {/* Content Preview */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Publicação (preview)</Label>
              <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
                {news.social || 'Sem conteúdo de redação (retorne à Fase 3)'}
              </div>
            </div>

            {/* Image Preview (uses authenticated proxy, same as Phase 3) */}
            {news.imageUrl && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Imagem</Label>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/news/${news.id}/image?t=${Date.now()}`}
                  alt="Imagem da publicação"
                  className="rounded-md max-h-32 object-cover"
                />
              </div>
            )}

            {/* First Comment */}
            <div className="space-y-2">
              <Label htmlFor="first-comment" className="text-xs text-muted-foreground">
                Primeiro Comentário (links)
              </Label>
              <Textarea
                id="first-comment"
                value={firstComment}
                onChange={(e) => setFirstComment(e.target.value)}
                rows={4}
                placeholder="Links do episódio..."
                className="resize-none text-sm"
              />
            </div>

            {/* Date/Time Picker */}
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="schedule-date" className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="size-3" />
                  Data
                </Label>
                <input
                  ref={dateInputRef}
                  id="schedule-date"
                  type="date"
                  min={today}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  onClick={handleDateClick}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer [color-scheme:dark]"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="schedule-time" className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" />
                  Horário
                </Label>
                <select
                  id="schedule-time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm [color-scheme:dark]"
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Schedule Button */}
            <Button
              onClick={handleSchedule}
              disabled={isScheduling || !selectedDate || !news.social || scheduleResult === 'success' || isScheduleInPast}
              className="w-full"
            >
              {isScheduling && <Loader2 className="size-4 animate-spin mr-2" />}
              {scheduleResult === 'success' ? 'Agendado ✓' : 'Confirmar Agendamento'}
            </Button>

            {/* Feedback */}
            {scheduleResult === 'success' && (
              <p className="text-xs text-green-400">
                Publicação agendada para {selectedDate} às {selectedTime}
              </p>
            )}
            {isScheduleInPast && (
              <p className="text-xs text-yellow-400">
                O horário selecionado já passou. Escolha uma data/hora futura.
              </p>
            )}
            {scheduleResult === 'error' && (
              <p className="text-xs text-destructive">{scheduleError}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
