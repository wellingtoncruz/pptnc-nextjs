'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRightIcon, CheckCircleIcon, AlertTriangleIcon, RefreshCwIcon, Loader2Icon } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { log } from '@/lib/logger'
import { getNextPhaseNameForType } from '@/lib/wizard'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'
import type { ComplianceRisk, Phase3Response } from '@/lib/llm'

import { ClickableTimestamp } from './clickable-timestamp'
import { ProcessingSpinner } from '../processing-spinner'
import { ReviewConfirmationAlert } from '../review-confirmation-alert'

interface Phase3ComplianceProps {
  wizard: UseWizardReturn
  video: Video
  /** Result from LLM processing (null while processing or if error) */
  complianceResult: Phase3Response | null
  /** Error message if processing failed */
  error?: string | null
  /** Callback to retry processing after error */
  onRetry?: () => void
  /** If true, data was loaded from cache (not fresh LLM call) */
  isFromCache?: boolean
  /** If true, producer has already confirmed review of cached data */
  isReviewed?: boolean
  /** Callback to confirm review when data is from cache */
  onConfirmReview?: () => void
  /** If true, review confirmation is in progress */
  isConfirmingReview?: boolean
  className?: string
}

/**
 * Risk type configuration for colored badges.
 * Exported for reuse in other components if needed.
 */
export const RISK_TYPE_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  brand_mention: { label: 'Menção de Marca', variant: 'default' },
  sensitive_language: { label: 'Linguagem Sensível', variant: 'destructive' },
  unverified_claim: { label: 'Claim Não Verificado', variant: 'secondary' },
  legal_risk: { label: 'Risco Legal', variant: 'destructive' },
  medical_claim: { label: 'Claim Médico', variant: 'destructive' },
  financial_advice: { label: 'Conselho Financeiro', variant: 'secondary' },
  competitor_mention: { label: 'Menção de Concorrente', variant: 'default' },
  other: { label: 'Outro', variant: 'outline' },
}

/**
 * Phase 3: Risk and Compliance Analysis (Tipo 2 - Immutable)
 *
 * Per processamento_video.md:
 * - Processes automatically when entering phase 3
 * - Shows list of potential compliance risks with clickable timestamps
 * - Shows success card if no risks found
 * - Requires confirmation before advancing if risks exist
 *
 * As a Type 2 (Immutable) phase, the check cannot be reprocessed after completion.
 */
export function Phase3Compliance({
  wizard,
  video,
  complianceResult,
  error,
  onRetry,
  isFromCache = false,
  isReviewed = false,
  onConfirmReview,
  isConfirmingReview = false,
  className,
}: Phase3ComplianceProps) {
  const hasRisks = complianceResult?.hasRisks ?? false
  const risks = complianceResult?.risks ?? []
  const hasError = !!error

  // Show review confirmation if data is from cache and not yet reviewed
  const needsReviewConfirmation = isFromCache && !isReviewed

  // State for advancing to next phase (prevents double clicks)
  const [isAdvancing, setIsAdvancing] = useState(false)

  // Check if can advance: result must exist, no error, and (not from cache OR already reviewed)
  const canAdvance = complianceResult !== null && !hasError && !needsReviewConfirmation && !isAdvancing

  // Progressive feedback timer for long-running LLM calls.
  // Note: isProcessing is true on mount before the LLM call fires (via useEffect in orchestrator).
  // This is acceptable because: (1) the default spinnerText matches the normal message,
  // (2) the LLM call fires within ~16ms of mount, and (3) progressive messages only appear after 30s.
  const isProcessing = !complianceResult && !hasError
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isProcessing) {
      setElapsedSeconds(0)
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1)
      }, 1000)
    } else {
      setElapsedSeconds(0)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isProcessing])

  const spinnerText = elapsedSeconds >= 60
    ? 'Processamento em andamento. Aguarde, não feche a página.'
    : elapsedSeconds >= 30
      ? 'Análise em andamento — vídeos longos podem demorar mais...'
      : 'Analisando riscos e conformidade do conteúdo...'

  const handleAdvance = () => {
    if (canAdvance && complianceResult) {
      setIsAdvancing(true)
      // Use combined action to mark phase complete and navigate
      wizard.completePhaseAndAdvance('risk', complianceResult)
      log('INFO', 'Advancing from Phase 3 to Phase 4', { videoId: video.id, hasRisks })
    }
  }

  return (
    <div className={cn('h-full', className)}>
      <div className="space-y-6 p-4">
        {/* Results card */}
        {complianceResult && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {hasRisks ? 'Possíveis Riscos de Compliance' : 'Análise de Risco e Conformidade'}
              </CardTitle>
              <CardDescription>
                {hasRisks
                  ? `Encontrei ${risks.length} possíve${risks.length === 1 ? 'l risco' : 'is riscos'} de compliance para você verificar.`
                  : 'Análise automática da transcrição concluída.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasRisks ? (
                <RisksList risks={risks} videoId={video.id} />
              ) : (
                <SuccessCard />
              )}
            </CardContent>
          </Card>
        )}

        {/* Error state with retry button */}
        {hasError && (
          <Card className="border-destructive">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-destructive">Erro na Análise</CardTitle>
              <CardDescription>
                Não foi possível completar a análise de compliance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center gap-4 py-6">
                <AlertTriangleIcon className="size-12 text-destructive" />
                <p className="text-sm text-muted-foreground text-center">{error}</p>
                {onRetry && (
                  <Button variant="outline" onClick={onRetry}>
                    <RefreshCwIcon className="size-4 mr-2" />
                    Tentar novamente
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading state when no result yet */}
        {!complianceResult && !hasError && (
          <ProcessingSpinner text={spinnerText} />
        )}

        {/* Review confirmation alert when data is from cache */}
        {needsReviewConfirmation && complianceResult && onConfirmReview && (
          <ReviewConfirmationAlert
            phaseName="riscos de compliance"
            onConfirm={onConfirmReview}
            isConfirming={isConfirmingReview}
          />
        )}

        {/* Advancement button with confirmation if risks exist */}
        <div className="flex flex-col gap-2">
          {hasRisks ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={!canAdvance}
                  className="w-full"
                  size="lg"
                >
                  {isAdvancing ? (
                    <>
                      Avançando...
                      <Loader2Icon className="size-4 ml-2 animate-spin" />
                    </>
                  ) : (
                    <>
                      Avançar para {getNextPhaseNameForType('risk', video.videoType)}
                      <ArrowRightIcon className="size-4 ml-2" />
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tem certeza que deseja continuar?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {risks.length === 1 ? 'Foi identificado' : 'Foram identificados'} {risks.length} possíve{risks.length === 1 ? 'l risco' : 'is riscos'} de compliance.
                    Recomendamos verificar cada item antes de prosseguir.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Não, verificar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAdvance}>
                    Sim, continuar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              onClick={handleAdvance}
              disabled={!canAdvance}
              className="w-full"
              size="lg"
            >
              {isAdvancing ? (
                <>
                  Avançando...
                  <Loader2Icon className="size-4 ml-2 animate-spin" />
                </>
              ) : (
                <>
                  Avançar para {getNextPhaseNameForType('risk', video.videoType)}
                  <ArrowRightIcon className="size-4 ml-2" />
                </>
              )}
            </Button>
          )}

          {!canAdvance && !isAdvancing && (
            <p className="text-xs text-muted-foreground text-center">
              Aguardando processamento da análise de compliance...
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Success card shown when no compliance risks are found.
 */
function SuccessCard() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
      <CheckCircleIcon className="size-12 text-green-500" />
      <div className="space-y-1">
        <p className="font-medium text-green-700 dark:text-green-400">
          Não me parece haver riscos de compliance.
        </p>
        <p className="text-sm text-muted-foreground">
          Você pode avançar para a próxima fase.
        </p>
      </div>
    </div>
  )
}

/**
 * Get badge configuration for a risk type.
 */
function getRiskConfig(riskType: string) {
  return RISK_TYPE_CONFIG[riskType] || RISK_TYPE_CONFIG.other
}

/**
 * List of compliance risks with clickable timestamps and colored badges.
 */
function RisksList({ risks, videoId }: { risks: ComplianceRisk[]; videoId: string }) {
  return (
    <ul className="space-y-3">
      {risks.map((risk, index) => {
        const config = getRiskConfig(risk.risk)
        return (
          <li
            key={`${risk.timestamp}-${index}`}
            className="flex flex-col gap-2 rounded-lg border p-3"
          >
            <div className="flex items-center gap-3">
              <ClickableTimestamp
                videoId={videoId}
                timestamp={risk.timestamp}
                className="shrink-0"
                applyContextOffset={true}
              />
              <Badge variant={config.variant}>
                <AlertTriangleIcon className="size-3 mr-1" />
                {config.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground pl-1">{risk.description}</p>
          </li>
        )
      })}
    </ul>
  )
}
