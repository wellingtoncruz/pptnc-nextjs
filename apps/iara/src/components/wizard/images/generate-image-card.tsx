'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangleIcon, Loader2, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { log } from '@/lib/logger'

/**
 * Card "Gerar com IAra" — geração assíncrona de UMA imagem via wizard job.
 *
 * Extraído de `phase-thumbnail.tsx` na Story 28.3 para servir também as
 * Imagens Extras do episódio (Story, Vitrine, Feed), que repetiriam este
 * mesmo fluxo três vezes. Comportamento idêntico ao original: os defaults
 * reproduzem os textos e os `data-testid` da fase Thumbnail, então o Epic 22
 * não muda em nada.
 *
 * Fluxo (Story 22.4, preservado):
 * 1. POST no `endpoint` retorna 202 + `jobId`.
 * 2. Polling em `/api/jobs/{jobId}` a cada `pollIntervalMs`.
 * 3. `status='complete'` → extrai `result.thumbnailUrl` e dispara `onGenerated`.
 * 4. `status='failed'` → mostra o erro e mantém o produtor na fase.
 *
 * O desmonte durante uma geração aborta o polling — sem isso, `onGenerated`
 * dispararia num pai já desmontado e consumiria mocks de fetch de testes
 * subsequentes.
 */

/** Intervalo entre polls. Mutável só para a suíte reduzir a ~10ms. */
let pollIntervalMs = 3000

/** @internal — usado apenas em testes; não chamar de código de produção. */
export function __setImagePollIntervalForTesting(ms: number): void {
  pollIntervalMs = ms
}

/** Timeout do polling: cobre o retry/backoff 30+60+120s do gerador. */
const POLL_TIMEOUT_MS = 5 * 60 * 1000

export interface GenerateImageCardTestIds {
  container: string
  observation: string
  button: string
  elapsed: string
  error: string
}

const THUMBNAIL_TEST_IDS: GenerateImageCardTestIds = {
  container: 'path-generate',
  observation: 'thumbnail-observation',
  button: 'generate-thumbnail-button',
  elapsed: 'thumbnail-elapsed',
  error: 'thumbnail-error',
}

interface GenerateImageCardProps {
  videoId: string
  /** Endpoint que cria o job. Retorna 202 + `{ jobId }`. */
  endpoint: string
  /**
   * Campos extras no body do POST além de `videoId`/`observation`
   * (ex.: `{ kind: 'story' }` nas imagens extras, `{ guestPhotoUrl }` no
   * thumbnail de cortes). Valores `undefined` são omitidos.
   */
  extraBody?: Record<string, string | undefined>
  /** Rótulo do botão. Default "Gerar Thumbnail". */
  buttonLabel?: string
  /** Texto explicativo abaixo do título. */
  description?: string
  /** Placeholder do textarea de observações. */
  observationPlaceholder?: string
  /**
   * Substantivo usado nas mensagens de progresso e de erro ("Gerando
   * {noun} com IAra..."). Default "thumbnail" — preserva palavra por palavra
   * o texto que o produtor já lê na fase Thumbnail.
   */
  noun?: string
  /** `data-testid`s. Default = os da fase Thumbnail (Epic 22). */
  testIds?: GenerateImageCardTestIds
  /** Conteúdo extra antes do botão (ex.: uploader de foto do convidado). */
  children?: React.ReactNode
  /**
   * Disparado a cada geração bem-sucedida, com a observação usada (trimada,
   * `undefined` se vazia) para a galeria mostrar ao lado da miniatura.
   */
  onGenerated: (payload: { url: string; observation: string | undefined }) => void
}

export function GenerateImageCard({
  videoId,
  endpoint,
  extraBody,
  buttonLabel = 'Gerar Thumbnail',
  description = 'Use Base + Referência configuradas + observações suas para o modelo gerar a thumbnail.',
  observationPlaceholder = 'Ex.: destaque o convidado, fundo escuro, sem texto...',
  noun = 'thumbnail',
  testIds = THUMBNAIL_TEST_IDS,
  children,
  onGenerated,
}: GenerateImageCardProps) {
  const [observation, setObservation] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const abortedRef = useRef(false)
  useEffect(() => {
    abortedRef.current = false
    return () => {
      abortedRef.current = true
    }
  }, [])

  useEffect(() => {
    if (isGenerating) {
      setElapsedSeconds(0)
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1)
      }, 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isGenerating])

  const spinnerText =
    elapsedSeconds >= 60
      ? 'Geração em andamento. Aguarde, não feche a página.'
      : elapsedSeconds >= 30
        ? `Gerando ${noun} — modelos preview podem demorar um pouco mais...`
        : `Gerando ${noun} com IAra...`

  // `extraBody` costuma ser um literal inline; serializar evita recriar o
  // callback (e reiniciar o efeito de abort) a cada render do pai.
  const extraBodyKey = JSON.stringify(extraBody ?? {})

  const handleGenerate = useCallback(async () => {
    setError(null)
    setIsGenerating(true)
    const observationForVersion = observation.trim() || undefined
    try {
      const body: Record<string, string> = { videoId }
      if (observationForVersion) body.observation = observationForVersion
      for (const [key, value] of Object.entries(
        JSON.parse(extraBodyKey) as Record<string, string | undefined>
      )) {
        if (value !== undefined && value !== null) body[key] = value
      }

      const startResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!startResponse.ok) {
        let message = 'Falha ao iniciar a geração. Tente novamente.'
        try {
          const payload = await startResponse.json()
          if (payload?.error?.message) message = payload.error.message
        } catch {
          // ignore
        }
        setError(message)
        setIsGenerating(false)
        log('WARN', 'Image generation start failed', { videoId, endpoint, status: startResponse.status })
        return
      }
      const startData = (await startResponse.json()) as { jobId?: string }
      if (!startData?.jobId) {
        setError('Resposta inválida do servidor. Tente novamente.')
        setIsGenerating(false)
        return
      }

      const jobId = startData.jobId
      const POLL_INTERVAL_MS = pollIntervalMs
      const startedAt = Date.now()

      while (true) {
        if (abortedRef.current) {
          log('INFO', 'Image polling aborted (unmount)', { videoId, jobId })
          return
        }
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setError('Geração demorou demais. Tente novamente.')
          log('WARN', 'Image polling timed out', { videoId, jobId })
          break
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        if (abortedRef.current) {
          return
        }
        let jobResponse: Response
        try {
          jobResponse = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`)
        } catch (err) {
          log('WARN', 'Image polling fetch threw, retrying', {
            videoId,
            jobId,
            error: err instanceof Error ? err.message : String(err),
          })
          continue
        }
        if (abortedRef.current) {
          return
        }
        if (!jobResponse.ok) {
          setError('Não foi possível acompanhar a geração. Tente novamente.')
          log('WARN', 'Image polling got non-ok', { videoId, jobId, status: jobResponse.status })
          break
        }
        const job = (await jobResponse.json()) as {
          status?: 'pending' | 'processing' | 'complete' | 'failed'
          result?: { thumbnailUrl?: string }
          error?: { message?: string }
        }
        if (job.status === 'complete') {
          const url = job.result?.thumbnailUrl
          if (!url) {
            setError('Geração concluiu sem URL — tente novamente.')
            log('WARN', 'Image job complete but no URL', { videoId, jobId })
            break
          }
          onGenerated({ url, observation: observationForVersion })
          log('INFO', 'Image generated', { videoId, jobId })
          break
        }
        if (job.status === 'failed') {
          const message = job.error?.message ?? 'Falha na geração. Tente novamente.'
          setError(message)
          log('WARN', 'Image job failed', { videoId, jobId, message })
          break
        }
        // pending or processing — continue polling
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado.'
      setError(`Erro inesperado ao gerar ${noun}: ${message}`)
      log('WARN', 'Image generation threw', {
        videoId,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIsGenerating(false)
    }
  }, [endpoint, extraBodyKey, noun, observation, onGenerated, videoId])

  return (
    <div className="rounded-md border p-4 flex flex-col gap-3" data-testid={testIds.container}>
      <div className="flex items-center gap-2 font-medium">
        <Sparkles className="h-4 w-4" />
        Gerar com IAra
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${testIds.observation}-${videoId}`} className="text-xs">
          Observações para a IAra (opcional)
        </Label>
        <Textarea
          id={`${testIds.observation}-${videoId}`}
          data-testid={testIds.observation}
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          placeholder={observationPlaceholder}
          rows={3}
          maxLength={2000}
          disabled={isGenerating}
        />
        <p className="text-[11px] text-muted-foreground">
          Pode gerar direto sem digitar nada — a IAra usa Base + Referência como contexto. Use a observação para refinar pontualmente.
        </p>
      </div>

      {children}

      <Button
        onClick={handleGenerate}
        disabled={isGenerating}
        data-testid={testIds.button}
        className="self-start"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {spinnerText}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            {buttonLabel}
          </>
        )}
      </Button>

      {isGenerating && (
        <p className="text-xs text-muted-foreground" data-testid={testIds.elapsed}>
          Tempo decorrido: {elapsedSeconds}s
        </p>
      )}

      {error && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive"
          data-testid={testIds.error}
        >
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
