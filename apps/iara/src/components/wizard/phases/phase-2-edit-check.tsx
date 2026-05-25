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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { log } from '@/lib/logger'
import { getNextPhaseName } from '@/lib/wizard'
import type { UseWizardReturn } from '@/hooks/use-wizard'
import type { Video } from '@/types/video'
import type { EditingIssue, Phase2Response } from '@/lib/llm'

import { ClickableTimestamp } from './clickable-timestamp'
import { ProcessingSpinner } from '../processing-spinner'
import { ReviewConfirmationAlert } from '../review-confirmation-alert'

interface Phase2EditCheckProps {
  wizard: UseWizardReturn
  video: Video
  /** Result from LLM processing (null while processing or if error) */
  editCheckResult: Phase2Response | null
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
 * Phase 2: Editing Check (Tipo 2 - Immutable)
 *
 * Per processamento_video.md:
 * - Processes automatically when entering phase 2
 * - Shows list of potential editing issues with clickable timestamps
 * - Shows success card if no issues found
 * - Requires confirmation before advancing if issues exist
 *
 * As a Type 2 (Immutable) phase, the check cannot be reprocessed after completion.
 */
export function Phase2EditCheck({
  wizard,
  video,
  editCheckResult,
  error,
  onRetry,
  isFromCache = false,
  isReviewed = false,
  onConfirmReview,
  isConfirmingReview = false,
  className,
}: Phase2EditCheckProps) {
  const hasIssues = editCheckResult?.hasIssues ?? false
  const issues = editCheckResult?.issues ?? []
  const hasError = !!error

  // Show review confirmation if data is from cache and not yet reviewed
  const needsReviewConfirmation = isFromCache && !isReviewed

  // State for advancing to next phase (prevents double clicks)
  const [isAdvancing, setIsAdvancing] = useState(false)

  // Check if can advance: result must exist, no error, and (not from cache OR already reviewed)
  const canAdvance = editCheckResult !== null && !hasError && !needsReviewConfirmation && !isAdvancing

  // Progressive feedback timer for long-running LLM calls.
  // Note: isProcessing is true on mount before the LLM call fires (via useEffect in orchestrator).
  // This is acceptable because: (1) the default spinnerText matches the normal message,
  // (2) the LLM call fires within ~16ms of mount, and (3) progressive messages only appear after 30s.
  const isProcessing = !editCheckResult && !hasError
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
      : 'Analisando transcrição para falhas de edição...'

  const handleAdvance = () => {
    if (canAdvance && editCheckResult) {
      setIsAdvancing(true)
      // Use combined action to mark phase complete and navigate
      wizard.completePhaseAndAdvance('edit-check', editCheckResult)
      log('INFO', 'Advancing from Phase 2 to Phase 3', { videoId: video.id, hasIssues })
    }
  }

  return (
    <div className={cn('h-full', className)}>
      <div className="space-y-6 p-4">
        {/* Error state with retry button */}
        {hasError && (
          <Card className="border-destructive">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-destructive">
                Erro na Checagem de Edição
              </CardTitle>
              <CardDescription>
                Não foi possível verificar falhas de edição automaticamente.
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

        {/* Results card */}
        {editCheckResult && !hasError && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {hasIssues ? 'Possíveis Falhas de Edição' : 'Checagem de Edição'}
              </CardTitle>
              <CardDescription>
                {hasIssues
                  ? `Encontrei ${issues.length} possíve${issues.length === 1 ? 'l problema' : 'is problemas'} de edição para você verificar.`
                  : 'Análise automática da transcrição concluída.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasIssues ? (
                <IssuesList issues={issues} videoId={video.id} />
              ) : (
                <SuccessCard />
              )}
            </CardContent>
          </Card>
        )}

        {/* Loading state when no result yet */}
        {!editCheckResult && !hasError && (
          <ProcessingSpinner text={spinnerText} />
        )}

        {/* Review confirmation alert when data is from cache */}
        {needsReviewConfirmation && editCheckResult && onConfirmReview && (
          <ReviewConfirmationAlert
            phaseName="checagem de edicao"
            onConfirm={onConfirmReview}
            isConfirming={isConfirmingReview}
          />
        )}

        {/* Advancement button with confirmation if issues exist */}
        <div className="flex flex-col gap-2">
          {hasIssues ? (
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
                      Avançar para {getNextPhaseName('edit-check')}
                      <ArrowRightIcon className="size-4 ml-2" />
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tem certeza que deseja continuar?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Foram identificadas {issues.length} possíve{issues.length === 1 ? 'l falha' : 'is falhas'} de edição.
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
                  Avançar para {getNextPhaseName('edit-check')}
                  <ArrowRightIcon className="size-4 ml-2" />
                </>
              )}
            </Button>
          )}

          {!canAdvance && !isAdvancing && (
            <p className="text-xs text-muted-foreground text-center">
              Aguardando processamento da checagem de edição...
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Success card shown when no editing issues are found.
 */
function SuccessCard() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
      <CheckCircleIcon className="size-12 text-green-500" />
      <div className="space-y-1">
        <p className="font-medium text-green-700 dark:text-green-400">
          Parabéns, não há falhas de edição que eu possa identificar.
        </p>
        <p className="text-sm text-muted-foreground">
          Você pode avançar para a próxima fase.
        </p>
      </div>
    </div>
  )
}

/**
 * List of editing issues with clickable timestamps.
 */
function IssuesList({ issues, videoId }: { issues: EditingIssue[]; videoId: string }) {
  return (
    <ul className="space-y-3">
      {issues.map((issue, index) => (
        <li
          key={`${issue.timestamp}-${index}`}
          className="flex items-start gap-3 rounded-lg border p-3"
        >
          <ClickableTimestamp
            videoId={videoId}
            timestamp={issue.timestamp}
            className="shrink-0"
          />
          <p className="text-sm text-muted-foreground">{issue.description}</p>
        </li>
      ))}
    </ul>
  )
}
