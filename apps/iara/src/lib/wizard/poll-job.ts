/**
 * Polls GET /api/wizard/jobs/[jobId] until the job reaches a terminal status
 * (`complete` or `failed`), or until the AbortSignal fires.
 *
 * Used by the wizard orchestrator after starting an async phase. Polling is
 * deliberately preferred over Firestore onSnapshot to avoid pulling the
 * Firebase Web SDK + NEXT_PUBLIC_FIREBASE_* env vars into the production build.
 *
 * @see app/api/wizard/jobs/[jobId]/route.ts for the polled endpoint
 */

export type WizardJobPollResult =
  | { status: 'complete'; result: unknown; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }
  | { status: 'failed'; error: { code: string; message: string; retryable?: boolean } }

interface PollOptions {
  jobId: string
  videoId: string
  /** Polling interval in ms. Defaults to 5000. */
  intervalMs?: number
  /** Aborts the polling loop. The returned promise rejects with `AbortError`. */
  signal?: AbortSignal
}

const DEFAULT_INTERVAL_MS = 5000

/**
 * Cancellable sleep — resolves after `ms`, or rejects with `AbortError` if
 * the signal fires before then.
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

export async function pollWizardJob({
  jobId,
  videoId,
  intervalMs = DEFAULT_INTERVAL_MS,
  signal,
}: PollOptions): Promise<WizardJobPollResult> {
  const url = `/api/wizard/jobs/${encodeURIComponent(jobId)}?videoId=${encodeURIComponent(videoId)}`

  // The first poll fires immediately to catch jobs that completed before the
  // first interval (rare but possible for very short LLM calls).
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
