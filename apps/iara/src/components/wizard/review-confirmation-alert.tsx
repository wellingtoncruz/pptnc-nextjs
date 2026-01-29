'use client'

import { AlertTriangleIcon, CheckIcon, Loader2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ReviewConfirmationAlertProps {
  /** Name of the phase for display */
  phaseName: string
  /** Callback when user confirms they've reviewed */
  onConfirm: () => void
  /** Whether confirmation is in progress */
  isConfirming?: boolean
}

/**
 * Alert component for phases that require explicit review confirmation.
 *
 * Used for phases 2 (Edit Check) and 3 (Compliance) when data was loaded
 * from cache (previously processed) rather than freshly generated.
 *
 * @see Story 5.3 - Smart Loading de Fases Imutaveis
 */
export function ReviewConfirmationAlert({
  phaseName,
  onConfirm,
  isConfirming = false,
}: ReviewConfirmationAlertProps) {
  return (
    <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-200">
          <AlertTriangleIcon className="size-4 text-amber-600 dark:text-amber-400" />
          Revisão Pendente
        </CardTitle>
        <CardDescription className="text-amber-700 dark:text-amber-300">
          Estes dados de {phaseName} já foram processados anteriormente.
          Por favor, revise os itens acima antes de continuar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="outline"
          size="sm"
          onClick={onConfirm}
          disabled={isConfirming}
          className="w-fit border-amber-600 text-amber-700 hover:bg-amber-100 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-900/40"
        >
          {isConfirming ? (
            <>
              <Loader2Icon className="size-4 mr-2 animate-spin" />
              Confirmando...
            </>
          ) : (
            <>
              <CheckIcon className="size-4 mr-2" />
              Sim, revisei e confirmo
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
