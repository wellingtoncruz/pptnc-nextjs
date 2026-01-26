'use client'

import { useState } from 'react'
import { z } from 'zod'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAutoSave } from '@/hooks/use-auto-save'
import { log } from '@/lib/logger'
import { SaveStatusIndicator } from './save-status-indicator'

interface VideoTypeConfig {
  minDuration: number
  maxDuration: number | null
}

interface VideoTypes {
  episode: VideoTypeConfig
  cut: VideoTypeConfig
  reel: VideoTypeConfig
}

interface DurationSettingsFormProps {
  videoTypes: VideoTypes
  onSave: (videoTypes: VideoTypes) => Promise<void>
}

/**
 * Validation schema for duration configuration.
 */
const DurationConfigSchema = z.object({
  episode: z.object({
    minDuration: z.number().int().nonnegative('Valor deve ser positivo'),
    maxDuration: z.null(),
  }),
  cut: z.object({
    minDuration: z.number().int().nonnegative('Valor deve ser positivo'),
    maxDuration: z.number().int().positive('Valor deve ser maior que zero'),
  }),
  reel: z.object({
    minDuration: z.number().int().nonnegative('Valor deve ser positivo'),
    maxDuration: z.number().int().positive('Valor deve ser maior que zero'),
  }),
}).refine(
  (data) => data.reel.maxDuration! < data.cut.minDuration,
  { message: 'Reel max deve ser menor que Cut min', path: ['reel', 'maxDuration'] }
).refine(
  (data) => data.cut.maxDuration! < data.episode.minDuration,
  { message: 'Cut max deve ser menor que Episode min', path: ['cut', 'maxDuration'] }
)

/**
 * Form for editing video duration classification thresholds.
 *
 * Features:
 * - Duration values in seconds (matching video schema standard)
 * - Inputs for min/max of each type
 * - Validation for non-negative and non-overlapping values
 * - Auto-save with 1.5s debounce
 */
export function DurationSettingsForm({ videoTypes, onSave }: DurationSettingsFormProps) {
  const [reelMax, setReelMax] = useState(videoTypes.reel.maxDuration ?? 0)
  const [cutMin, setCutMin] = useState(videoTypes.cut.minDuration)
  const [cutMax, setCutMax] = useState(videoTypes.cut.maxDuration ?? 0)
  const [episodeMin, setEpisodeMin] = useState(videoTypes.episode.minDuration)
  const [validationError, setValidationError] = useState<string | null>(null)

  const buildVideoTypes = (): VideoTypes => ({
    episode: { minDuration: episodeMin, maxDuration: null },
    cut: { minDuration: cutMin, maxDuration: cutMax },
    reel: { minDuration: 0, maxDuration: reelMax },
  })

  const { saveStatus, save } = useAutoSave(
    { reelMax, cutMin, cutMax, episodeMin },
    async () => {
      setValidationError(null)
      const newVideoTypes = buildVideoTypes()

      const result = DurationConfigSchema.safeParse(newVideoTypes)
      if (!result.success) {
        const message = result.error.issues[0]?.message || 'Configuração inválida'
        setValidationError(message)
        // Return early - validation errors are expected, not save failures
        return
      }

      try {
        await onSave(newVideoTypes)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao salvar'
        setValidationError(message)
        log('ERROR', 'Failed to save duration config', { error: message })
        throw err
      }
    },
    1500
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Duração por Tipo de Vídeo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Defina os limites de duração (em segundos) para classificação automática de vídeos.
        </p>

        {/* Reel */}
        <div className="space-y-2">
          <Label className="text-base font-medium">Reels</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">0 até</span>
            <Input
              type="number"
              min={0}
              value={reelMax}
              onChange={(e) => setReelMax(Number(e.target.value))}
              onBlur={() => save()}
              className="w-24"
              aria-label="Duração máxima de Reels em segundos"
            />
            <span className="text-sm text-muted-foreground">segundos</span>
          </div>
        </div>

        {/* Cut */}
        <div className="space-y-2">
          <Label className="text-base font-medium">Cortes</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={cutMin}
              onChange={(e) => setCutMin(Number(e.target.value))}
              onBlur={() => save()}
              className="w-24"
              aria-label="Duração mínima de Cortes em segundos"
            />
            <span className="text-sm text-muted-foreground">até</span>
            <Input
              type="number"
              min={0}
              value={cutMax}
              onChange={(e) => setCutMax(Number(e.target.value))}
              onBlur={() => save()}
              className="w-24"
              aria-label="Duração máxima de Cortes em segundos"
            />
            <span className="text-sm text-muted-foreground">segundos</span>
          </div>
        </div>

        {/* Episode */}
        <div className="space-y-2">
          <Label className="text-base font-medium">Episódios</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">A partir de</span>
            <Input
              type="number"
              min={0}
              value={episodeMin}
              onChange={(e) => setEpisodeMin(Number(e.target.value))}
              onBlur={() => save()}
              className="w-24"
              aria-label="Duração mínima de Episódios em segundos"
            />
            <span className="text-sm text-muted-foreground">segundos (sem limite máximo)</span>
          </div>
        </div>

        {/* Status/Error */}
        <div className="pt-2">
          {validationError ? (
            <p className="text-xs text-destructive">{validationError}</p>
          ) : (
            <SaveStatusIndicator status={saveStatus} />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
