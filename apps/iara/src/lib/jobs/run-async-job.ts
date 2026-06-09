/**
 * Roda uma chamada LLM longa via o pipeline assíncrono genérico (Epic 27, TD-14):
 *
 *   1. POST `{url}?mode=async`  →  202 + { jobId }
 *   2. Poll `GET /api/jobs/{jobId}` até status terminal
 *   3. Retorna o result tipado, ou throw com a mensagem de erro
 *
 * Escapa do edge timeout (~60s) do Cloud Run: o trabalho LLM roda em background
 * enquanto cada poll é um request sub-segundo, bem abaixo do teto.
 *
 * @see lib/jobs/poll-job.ts
 * @see lib/wizard/run-async-phase.ts (predecessor específico do Wizard)
 */
import { pollJob } from './poll-job'

interface RunAsyncJobOptions {
  /** URL base da rota (sem query). `?mode=async` é anexado automaticamente. */
  url: string
  /** Corpo do POST (JSON). */
  body?: Record<string, unknown>
  /** Intervalo de polling em ms. */
  pollIntervalMs?: number
  signal?: AbortSignal
}

/**
 * Lança Error com a mensagem legível em falha (HTTP, falha do job, ou abort).
 */
export async function runAsyncJob<T>({
  url,
  body,
  pollIntervalMs,
  signal,
}: RunAsyncJobOptions): Promise<T> {
  const separator = url.includes('?') ? '&' : '?'
  const response = await fetch(`${url}${separator}mode=async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(errorBody?.error?.message || 'Erro ao iniciar o processamento')
  }

  const { jobId } = await response.json() as { jobId: string }

  const outcome = await pollJob({ jobId, intervalMs: pollIntervalMs, signal })

  if (outcome.status === 'failed') {
    throw new Error(outcome.error.message)
  }

  return outcome.result as T
}
