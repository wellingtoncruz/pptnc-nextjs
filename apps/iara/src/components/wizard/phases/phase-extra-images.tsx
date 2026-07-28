'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangleIcon, Download, ImageIcon, ImageOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GenerateImageCard } from '@/components/wizard/images/generate-image-card'
import {
  GeneratedVersionsGallery,
  type GeneratedThumbnailVersion,
} from '@/components/wizard/thumbnail/generated-versions-gallery'
import { ManualUploadDropzone } from '@/components/wizard/thumbnail/manual-upload-dropzone'
import { ThumbnailLightbox } from '@/components/wizard/thumbnail/thumbnail-lightbox'
import { log } from '@/lib/logger'
import { EXTRA_IMAGE_KINDS, EXTRA_IMAGE_LABELS, type ExtraImageKind } from '@/lib/schemas/podcast'
import { getNextPhaseNameForType } from '@/lib/wizard'
import type { ExtraImages, Video } from '@/types/video'
import type { ThumbnailPromptField } from '@/types/podcast'

interface PhaseExtraImagesProps {
  video: Video
  features?: { thumbnailGeneration?: boolean; extraImagesGeneration?: boolean }
  /**
   * Disparado ao avançar. Repassa o mapa completo de imagens persistidas para
   * o orquestrador atualizar o `videoData` antes de navegar — mesmo contrato
   * do `onAdvance` da fase Thumbnail.
   */
  onAdvance?: (payload: { extraImages: ExtraImages }) => void
  /** Imagens já persistidas no vídeo, para hidratar a fase ao reabrir. */
  selectedExtraImages?: ExtraImages
  className?: string
}

/**
 * Fase Imagens Extras — Epic 28 / Story 28.5.
 *
 * Três quadros independentes (Story, Vitrine, Feed) com a mesma dinâmica da
 * fase Thumbnail: gerar via IAra, galeria de versões da sessão, upload manual,
 * lightbox e download. Cada quadro persiste sozinho, ao ser selecionado.
 *
 * **Não bloqueia o avanço** (decisão Wellington, 2026-07-28): as três são
 * acessórias e nada nelas é pré-requisito da publicação no YouTube, então
 * travar o botão só criaria atrito em episódio que não precisa delas.
 *
 * Gated por `podcast.features.extraImagesGeneration` e renderizada apenas para
 * `episode` (ver `getPhaseIdsForVideoTypeWithFeatures`).
 */
export function PhaseExtraImages({
  video,
  features,
  onAdvance,
  selectedExtraImages,
  className,
}: PhaseExtraImagesProps) {
  const [configs, setConfigs] = useState<Partial<Record<ExtraImageKind, ThumbnailPromptField>>>({})
  const [configLoaded, setConfigLoaded] = useState(false)
  const [persisted, setPersisted] = useState<ExtraImages>(selectedExtraImages ?? {})
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/podcast')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        const extra = d?.data?.prompts?.episode?.extraImages as
          | Partial<Record<ExtraImageKind, ThumbnailPromptField>>
          | undefined
        setConfigs(extra ?? {})
        setConfigLoaded(true)
      })
      .catch((err) => {
        if (cancelled) return
        log('WARN', 'Failed to load extra images config', {
          error: err instanceof Error ? err.message : String(err),
        })
        setConfigLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handlePersisted = useCallback((kind: ExtraImageKind, url: string) => {
    setPersisted((prev) => ({ ...prev, [kind]: url }))
  }, [])

  const handleAdvance = useCallback(() => {
    onAdvance?.({ extraImages: persisted })
  }, [onAdvance, persisted])

  return (
    <div className={className} data-testid="phase-extra-images" data-video-id={video.id}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Imagens Extras
          </CardTitle>
          <CardDescription>
            Gere as imagens de Story, Vitrine e Feed do episódio. Todas são opcionais — você
            pode seguir sem gerar nenhuma. Elas não vão para o YouTube: ficam disponíveis
            para download aqui e no painel do vídeo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {EXTRA_IMAGE_KINDS.map((kind) => (
            <ExtraImageSection
              key={kind}
              kind={kind}
              videoId={video.id}
              config={configs[kind]}
              configLoaded={configLoaded}
              persistedUrl={persisted[kind]}
              onPersisted={handlePersisted}
              onPreview={setLightboxUrl}
            />
          ))}

          <div className="flex justify-end">
            <Button onClick={handleAdvance} data-testid="continuar-extra-images">
              {`Continuar para ${getNextPhaseNameForType('extra-images', video.videoType, features) ?? 'Publicar'}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ThumbnailLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  )
}

interface ExtraImageSectionProps {
  kind: ExtraImageKind
  videoId: string
  config: ThumbnailPromptField | undefined
  configLoaded: boolean
  persistedUrl: string | undefined
  onPersisted: (kind: ExtraImageKind, url: string) => void
  onPreview: (url: string) => void
}

/**
 * Um quadro. Mantém seu próprio histórico de versões da sessão e persiste a
 * seleção de forma independente dos outros dois — salvar Story não mexe em
 * Vitrine nem em Feed.
 */
function ExtraImageSection({
  kind,
  videoId,
  config,
  configLoaded,
  persistedUrl,
  onPersisted,
  onPreview,
}: ExtraImageSectionProps) {
  const label = EXTRA_IMAGE_LABELS[kind]
  const [versions, setVersions] = useState<GeneratedThumbnailVersion[]>([])
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Seleção local vence a hidratada, pelo mesmo motivo da fase Thumbnail:
  // sem isso, uma imagem já persistida mascararia a recém-gerada.
  const effectiveUrl = selectedUrl ?? persistedUrl ?? undefined
  const isPersisted = Boolean(effectiveUrl && effectiveUrl === persistedUrl)

  const handleGenerated = useCallback(
    (payload: { url: string; observation: string | undefined }) => {
      const version: GeneratedThumbnailVersion = {
        id: `gen-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: payload.url,
        observation: payload.observation,
        timestamp: new Date(),
        source: 'generated',
      }
      setVersions((prev) => [...prev, version])
      setSelectedUrl(version.url)
    },
    [kind]
  )

  const handleUploaded = useCallback(
    (payload: { url: string }) => {
      const version: GeneratedThumbnailVersion = {
        id: `up-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: payload.url,
        observation: undefined,
        timestamp: new Date(),
        source: 'upload',
      }
      setVersions((prev) => [...prev, version])
      setSelectedUrl(version.url)
    },
    [kind]
  )

  const handleSave = useCallback(async () => {
    if (!effectiveUrl || isSaving) return
    setSaveError(null)
    setIsSaving(true)
    try {
      const response = await fetch('/api/wizard/extra-images/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, kind, selectedImageUrl: effectiveUrl }),
      })
      if (!response.ok) {
        let message = `Falha ao salvar a imagem ${label}. Tente novamente.`
        try {
          const payload = await response.json()
          if (payload?.error?.message) message = payload.error.message
        } catch {
          // ignore parse error
        }
        setSaveError(message)
        log('WARN', 'Extra image select failed', { videoId, kind, status: response.status })
        return
      }
      const data = (await response.json()) as { imageUrl?: string }
      if (!data?.imageUrl) {
        setSaveError('Resposta inválida do servidor. Tente novamente.')
        return
      }
      onPersisted(kind, data.imageUrl)
      setSelectedUrl(data.imageUrl)
      log('INFO', 'Extra image selected and persisted', { videoId, kind })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado.'
      setSaveError(`Erro inesperado: ${message}`)
      log('WARN', 'Extra image select threw', { videoId, kind, message })
    } finally {
      setIsSaving(false)
    }
  }, [effectiveUrl, isSaving, kind, label, onPersisted, videoId])

  return (
    <div className="rounded-md border p-4 space-y-4" data-testid={`extra-image-${kind}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{label}</h3>
        {isPersisted && (
          <span className="text-xs text-muted-foreground" data-testid={`${kind}-saved-badge`}>
            Salva
          </span>
        )}
      </div>

      <ConfigStatus label={label} config={config} configLoaded={configLoaded} />

      <GenerateImageCard
        videoId={videoId}
        endpoint="/api/wizard/extra-images/generate"
        extraBody={{ kind }}
        buttonLabel={`Gerar ${label}`}
        noun={label}
        description={`Use Base + Referência de ${label} configuradas + observações suas para o modelo gerar a imagem.`}
        observationPlaceholder="Ex.: enquadramento vertical, muito espaço no topo, sem texto..."
        testIds={{
          container: `path-generate-${kind}`,
          observation: `${kind}-observation`,
          button: `generate-${kind}-button`,
          elapsed: `${kind}-elapsed`,
          error: `${kind}-error`,
        }}
        onGenerated={handleGenerated}
      />

      <GeneratedVersionsGallery
        versions={versions}
        selectedUrl={effectiveUrl}
        onSelect={setSelectedUrl}
        onPreview={onPreview}
      />

      <ManualUploadDropzone videoId={videoId} onUploaded={handleUploaded} />

      <SelectedImageSummary
        kind={kind}
        label={label}
        url={effectiveUrl}
        onPreview={onPreview}
      />

      {saveError && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive"
          data-testid={`${kind}-save-error`}
        >
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={!effectiveUrl || isSaving || isPersisted}
          data-testid={`save-${kind}-button`}
        >
          {isSaving ? 'Salvando...' : isPersisted ? 'Salva' : `Salvar ${label}`}
        </Button>
      </div>
    </div>
  )
}

function ConfigStatus({
  label,
  config,
  configLoaded,
}: {
  label: string
  config: ThumbnailPromptField | undefined
  configLoaded: boolean
}) {
  if (!configLoaded) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="extra-config-loading">
        Carregando configuração...
      </p>
    )
  }
  const hasPrompt = Boolean(config?.description && config?.expectedOutput)
  if (!hasPrompt) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-400">
        Prompt de <strong>{label}</strong> não configurado. A geração via IAra vai falhar até
        que Descrição e Saída Esperada sejam preenchidas em Configurações → Prompts por Tipo
        de Vídeo → Episódios → Imagens Extras. O upload manual funciona mesmo assim.
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <ReferenceSlot label={`${label} Base`} url={config?.baseImageUrl} />
      <ReferenceSlot label={`${label} Referência`} url={config?.referenceImageUrl} />
    </div>
  )
}

function ReferenceSlot({ label, url }: { label: string; url: string | undefined }) {
  return (
    <div className="flex items-start gap-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Preview ${label}`}
          className="h-16 w-auto rounded border bg-muted object-cover"
        />
      ) : (
        <div className="h-16 w-16 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">
          <ImageOff className="h-4 w-4" />
        </div>
      )}
      <div className="text-xs">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground">{url ? 'Configurada' : 'Não configurada'}</p>
      </div>
    </div>
  )
}

/**
 * Resumo da imagem escolhida + download.
 *
 * O `download` funciona porque o proxy é same-origin e responde com
 * `Content-Type` de imagem — o browser salva em vez de navegar.
 */
function SelectedImageSummary({
  kind,
  label,
  url,
  onPreview,
}: {
  kind: ExtraImageKind
  label: string
  url: string | undefined
  onPreview: (url: string) => void
}) {
  if (!url) {
    return (
      <p className="text-xs text-muted-foreground" data-testid={`${kind}-empty`}>
        Nenhuma imagem de {label} selecionada ainda.
      </p>
    )
  }
  return (
    <div className="flex items-center gap-3" data-testid={`${kind}-selected`}>
      <button
        type="button"
        onClick={() => onPreview(url)}
        className="cursor-zoom-in rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Ver ${label} em tamanho real`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${label} selecionada`}
          className="h-24 w-auto rounded border bg-muted object-cover"
        />
      </button>
      <Button asChild size="sm" variant="outline">
        <a href={url} download={`${kind}.png`} data-testid={`download-${kind}`}>
          <Download className="h-4 w-4 mr-2" />
          Baixar
        </a>
      </Button>
    </div>
  )
}
