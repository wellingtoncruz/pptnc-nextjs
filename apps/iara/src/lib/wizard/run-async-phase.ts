/**
 * Roda uma fase do Wizard via o pipeline assíncrono genérico (Epic 27 / TD-14).
 *
 * Thin wrapper sobre `runAsyncJob`: monta a URL da fase e delega. Mantém a
 * assinatura histórica (`{ phase, videoId, body, pollIntervalMs, signal }`)
 * para o orchestrator não mudar. A infra de jobs do Wizard foi unificada com a
 * genérica (`/api/jobs/[jobId]`, coleção top-level `jobs`) — ADR-27.2.
 *
 *   1. POST /api/wizard/phase/{phase}?mode=async  →  202 + jobId
 *   2. Poll GET /api/jobs/{jobId} até status terminal
 *   3. Retorna o result tipado, ou throw com a mensagem de erro
 *
 * @see lib/jobs/run-async-job.ts (implementação genérica)
 */
import { runAsyncJob } from '@/lib/jobs/run-async-job'
import type { LLMPhaseId } from '@/lib/wizard'

interface RunAsyncPhaseOptions {
  /**
   * Phase identifier. Phases 1-7 compartilham /api/wizard/phase/[phase]; '5b'
   * tem rota própria (/api/wizard/phase/short-title).
   */
  phase: LLMPhaseId | 'short-title'
  videoId: string
  /**
   * Campos extras do corpo. `videoId` é adicionado automaticamente.
   * Fases 5/5b/6/7 podem passar `additionalContext`; 5/6/7 `previousPhaseData`.
   */
  body?: Record<string, unknown>
  /** Intervalo de polling em ms — 10000 p/ fases 1-4, 5000 p/ 5/5b/6/7. */
  pollIntervalMs: number
  signal?: AbortSignal
}

export async function runAsyncPhase<T>({
  phase,
  videoId,
  body,
  pollIntervalMs,
  signal,
}: RunAsyncPhaseOptions): Promise<T> {
  const phaseSegment = String(phase)
  return runAsyncJob<T>({
    url: `/api/wizard/phase/${phaseSegment}`,
    body: { videoId, ...(body ?? {}) },
    pollIntervalMs,
    signal,
  })
}
