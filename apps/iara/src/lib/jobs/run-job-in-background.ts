/**
 * Executa o trabalho de um job LLM em background (Epic 27, fecha TD-14).
 *
 * Fire-and-forget: o route handler chama `void runJobInBackground(...)` DEPOIS
 * de já ter retornado 202 + jobId. Esta função faz as transições de status
 * (processing → complete/failed) e mapeia erros pro shape de erro do job.
 *
 * `work` faz a chamada LLM + a persistência específica da feature e retorna o
 * `result` (o MESMO payload que o caminho síncrono retornaria) + usage opcional.
 * O cliente recebe esse `result` via polling, idêntico ao sync.
 *
 * @see app/api/wizard/phase/[phase]/route.ts (processWizardJobInBackground — predecessor)
 */
import { updateJob } from '@/lib/firebase/jobs-admin'
import { createLLMError, LLMError } from '@/lib/llm/errors'
import { log } from '@/lib/logger'

export interface JobWorkResult {
  /** Payload final do job — o mesmo que o caminho síncrono retornaria. */
  result: unknown
  /** Usage de tokens, quando a feature tiver. */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export async function runJobInBackground(
  podcastId: string,
  jobId: string,
  work: () => Promise<JobWorkResult>
): Promise<void> {
  try {
    await updateJob(podcastId, jobId, { status: 'processing' })

    const { result, usage } = await work()

    // Firestore rejeita `undefined` em qualquer field — só inclui `usage` quando
    // a feature de fato tem (ex.: thumbnail/imagem não retornam usage).
    await updateJob(podcastId, jobId, {
      status: 'complete',
      result,
      ...(usage !== undefined ? { usage } : {}),
    })
    log('INFO', 'Job completed', { jobId })
  } catch (error) {
    const llmError = error instanceof LLMError ? error : createLLMError(error)
    log('ERROR', 'Job failed', {
      jobId,
      errorCode: llmError.code,
      message: llmError.message,
    })
    // Best-effort: registrar a falha no job para o cliente parar de fazer polling.
    try {
      await updateJob(podcastId, jobId, {
        status: 'failed',
        error: {
          code: llmError.code,
          message: llmError.message,
          retryable: llmError.retryable,
        },
      })
    } catch (updateError) {
      log('ERROR', 'Failed to mark job as failed', { jobId, error: String(updateError) })
    }
  }
}
