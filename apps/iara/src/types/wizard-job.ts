import type { z } from 'zod'

import type {
  WizardJobCreateSchema,
  WizardJobPhaseSchema,
  WizardJobSchema,
  WizardJobStatusSchema,
  WizardJobUpdateSchema,
} from '@/lib/schemas/wizard-job'

export type WizardJobStatus = z.infer<typeof WizardJobStatusSchema>
export type WizardJobPhase = z.infer<typeof WizardJobPhaseSchema>
export type WizardJobCreate = z.infer<typeof WizardJobCreateSchema>
export type WizardJobUpdate = z.infer<typeof WizardJobUpdateSchema>
export type WizardJob = z.infer<typeof WizardJobSchema>
