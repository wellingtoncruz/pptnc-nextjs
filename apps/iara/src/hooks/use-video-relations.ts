'use client'

import { useEffect, useState } from 'react'

import type { VideoRelations } from '@/lib/wizard/video-relations'

export interface VideoRelationsState extends VideoRelations {
  canReclassify: boolean
}

/**
 * Vínculos pai/filho do vídeo (GET /relations) — Adendo B do Epic 25.
 * `null` enquanto carrega ou se a leitura falhar: quem consome esconde/trava
 * as ações que dependem disso (o servidor revalida de qualquer forma).
 */
export function useVideoRelations(
  videoId: string,
  refreshKey?: unknown,
  enabled = true
): VideoRelationsState | null {
  // O resultado guarda a chave do pedido que o produziu: trocar de vídeo (ou de
  // refreshKey) volta a `null` na hora, sem setState síncrono no efeito.
  const requestKey = enabled ? `${videoId}|${String(refreshKey)}` : null
  const [result, setResult] = useState<{ key: string; data: VideoRelationsState | null } | null>(null)

  useEffect(() => {
    if (!requestKey) return
    let cancelled = false
    Promise.resolve()
      .then(() => fetch(`/api/videos/${videoId}/relations`))
      .then((res) => (res?.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setResult({ key: requestKey, data: body?.data ?? null })
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, videoId])

  return result?.key === requestKey ? result.data : null
}
