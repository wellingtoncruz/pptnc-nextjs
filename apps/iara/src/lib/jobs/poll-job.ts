/**
 * Faz polling em `GET /api/jobs/[jobId]` até o job atingir status terminal
 * (`complete` ou `failed`), ou até o AbortSignal disparar (Epic 27, fecha TD-14).
 *
 * Coleção top-level → o read precisa só do jobId (sem parent). Polling é
 * deliberadamente preferido a onSnapshot p/ não puxar o Firebase Web SDK +
 * NEXT_PUBLIC_FIREBASE_* pro bundle de produção.
 *
 * @see app/api/jobs/[jobId]/route.ts (endpoint polled)
 * @see lib/wizard/poll-job.ts (predecessor específico do Wizard)
 */

export type JobPollResult =
  | { status: 'complete'; result: unknown; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }
  | { status: 'failed'; error: { code: string; message: string; retryable?: boolean } }

interface PollOptions {
  jobId: string
  /** Intervalo de polling em ms. Default 5000. */
  intervalMs?: number
  /** Aborta o loop. A promise rejeita com `AbortError`. */
  signal?: AbortSignal
}

const DEFAULT_INTERVAL_MS = 5000

/**
 * Sleep cancelável — resolve após `ms`, ou rejeita com `AbortError` se o signal
 * disparar antes.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function pollJob({
  jobId,
  intervalMs = DEFAULT_INTERVAL_MS,
  signal,
}: PollOptions): Promise<JobPollResult> {
  const url = `/api/jobs/${encodeURIComponent(jobId)}`

  // O primeiro poll dispara imediatamente p/ pegar jobs que completaram antes do
  // primeiro intervalo (raro, mas possível em chamadas LLM curtas).
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const response = await fetch(url, { signal })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      const message = body?.error?.message || `Falha ao consultar job (HTTP ${response.status})`
      throw new Error(message)
    }

    const job = await response.json() as {
      status: 'pending' | 'processing' | 'complete' | 'failed'
      result?: unknown
      error?: { code: string; message: string; retryable?: boolean }
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
    }

    if (job.status === 'complete') {
      return { status: 'complete', result: job.result, usage: job.usage }
    }
    if (job.status === 'failed') {
      return {
        status: 'failed',
        error: job.error ?? { code: 'UNKNOWN', message: 'Falha desconhecida no job' },
      }
    }

    await delay(intervalMs, signal)
  }
}
