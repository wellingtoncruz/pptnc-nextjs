import { z } from 'zod'

/**
 * Schema for generic async LLM processing jobs (Epic 27 — fecha TD-14).
 *
 * Path: `podcasts/{podcastId}/jobs/{jobId}` (top-level, NÃO subcollection).
 *
 * Generaliza o padrão fire-and-forget + polling do Wizard para qualquer chamada
 * LLM longa, escapando do edge timeout (~60s) do Cloud Run. Por ser top-level,
 * o read (`GET /api/jobs/[jobId]`) precisa só do jobId — sem amarrar a um parent
 * (as features pendem de recursos heterogêneos: vídeo, notícia…).
 *
 * Fluxo:
 * 1. Frontend POST `…?mode=async` → handler cria job (status='pending'), 202+jobId
 * 2. `runJobInBackground` processa (status='processing') e persiste no recurso dono
 * 3. Ao completar: status='complete' + `result` (o mesmo payload do caminho sync)
 * 4. Frontend faz polling em `GET /api/jobs/[jobId]` até status terminal
 *
 * O `result` é o payload que o caminho síncrono retornaria — o cliente consome
 * idêntico ao sync. A persistência no recurso dono continua a cargo do worker.
 *
 * @see lib/schemas/wizard-job.ts (predecessor específico do Wizard)
 */

export const JobStatusSchema = z.enum(['pending', 'processing', 'complete', 'failed'])

const JobErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean().default(false),
})

const JobUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
})

const TimestampLikeSchema = z.custom<{ toDate(): Date }>(
  (val) => val !== null && typeof val === 'object' && 'toDate' in val
)

/**
 * Schema para criar um job (estado inicial pending).
 *
 * `type` é uma string livre p/ telemetria/debug (ex.: 'social-post', 'adwords',
 * 'newsletter-draft', 'wizard:edit-check'). NÃO controla fluxo.
 * `context` é metadado opcional p/ debug (videoId, newsId, networkId, phase…).
 */
export const JobCreateSchema = z.object({
  type: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Schema do job em voo ou concluído (lido do Firestore).
 *
 * `result` é permissivo (z.unknown()) — o consumidor narrow pelo `type` e faz
 * cast pro tipo apropriado da feature.
 */
export const JobSchema = JobCreateSchema.extend({
  id: z.string().min(1),
  status: JobStatusSchema,
  result: z.unknown().optional(),
  usage: JobUsageSchema.optional(),
  error: JobErrorSchema.optional(),
  createdAt: TimestampLikeSchema,
  updatedAt: TimestampLikeSchema,
})

/**
 * Schema para updates parciais durante o processamento.
 */
export const JobUpdateSchema = z.object({
  status: JobStatusSchema.optional(),
  result: z.unknown().optional(),
  usage: JobUsageSchema.optional(),
  error: JobErrorSchema.optional(),
})
