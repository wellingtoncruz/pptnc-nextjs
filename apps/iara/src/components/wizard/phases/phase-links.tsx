'use client'

import { useState } from 'react'
import {
  ArrowRightIcon,
  ExternalLinkIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { EditableText } from '@/components/ui/editable-text'
import { getNextPhaseNameForType } from '@/lib/wizard'
import type { Link, Video } from '@/types/video'

interface PhaseLinksProps {
  video: Video
  /** Podcast features (for the next-phase label) */
  features?: { thumbnailGeneration?: boolean; extraImagesGeneration?: boolean }
  /** Persist the full links array (PUT /api/videos/[videoId]/links) */
  onLinksChange: (links: Link[]) => Promise<void>
  /** Advance to Publicar — orchestrator confirms review ('links') + navigates */
  onAdvance: () => void
  /** True while the review confirmation / advance is in progress */
  isAdvancing?: boolean
  className?: string
}

/** Lenient client-side URL check — the endpoint is the authoritative validator. */
function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Phase Links (Epic 26) — extended, manual phase for episodes only.
 *
 * The producer registers reference links (url + description) attached to the
 * episode. Links flagged "incluir na descrição" are appended deterministically
 * to the YouTube description at publish time (Story 26.6).
 *
 * Completion is by review confirmation (reviewedPhases includes 'links'), NOT
 * by data presence — zero links is a valid reviewed state (ADR-26.5). The
 * advance button confirms the review and navigates to Publicar.
 */
export function PhaseLinks({
  video,
  features,
  onLinksChange,
  onAdvance,
  isAdvancing = false,
  className,
}: PhaseLinksProps) {
  const [links, setLinks] = useState<Link[]>(video.links ?? [])
  const [newUrl, setNewUrl] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newInclude, setNewInclude] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const nextPhaseName = getNextPhaseNameForType('links', video.videoType, features)
  // Epic 26 Bloco D v2 (ADR-26.8): a sinalização de links citados deriva dos
  // issues tipificados do edit-check — fonte única, sem campo paralelo. A fase
  // de Edição marca menções a link/descrição com category 'link'.
  const mentionedLinks = (video.editingIssues ?? []).filter((issue) => issue.category === 'link')

  /** Optimistically apply the new array, then persist it. */
  const persist = async (next: Link[]) => {
    const previous = links
    setLinks(next)
    setIsSaving(true)
    setSaveError(null)
    try {
      await onLinksChange(next)
    } catch (error) {
      // Roll back on failure so the UI reflects what is actually persisted.
      setLinks(previous)
      setSaveError(error instanceof Error ? error.message : 'Erro ao salvar os links')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAdd = async () => {
    const url = newUrl.trim()
    const description = newDescription.trim()
    if (!url || !description) {
      setFormError('Informe a URL e a descrição do link.')
      return
    }
    if (!isValidUrl(url)) {
      setFormError('URL inválida — use http(s)://...')
      return
    }
    setFormError(null)
    await persist([...links, { url, description, includeInDescription: newInclude }])
    setNewUrl('')
    setNewDescription('')
    setNewInclude(false)
  }

  const handleRemove = async (index: number) => {
    await persist(links.filter((_, i) => i !== index))
  }

  const handleToggleInclude = async (index: number, value: boolean) => {
    await persist(links.map((l, i) => (i === index ? { ...l, includeInDescription: value } : l)))
  }

  const handleDescriptionEdit = async (index: number, description: string) => {
    const trimmed = description.trim()
    if (!trimmed) return
    await persist(links.map((l, i) => (i === index ? { ...l, description: trimmed } : l)))
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        {/* Mentions detected by the edit-check phase (Epic 26 Bloco D) — sinal
            não-acionável: o editor decide se cadastra os links manualmente. */}
        {mentionedLinks.length > 0 && (
          <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-200">
                <LinkIcon className="size-4 text-amber-600 dark:text-amber-400" />
                {mentionedLinks.length === 1
                  ? 'O vídeo menciona um link em 1 ponto'
                  : `O vídeo menciona links em ${mentionedLinks.length} pontos`}
              </CardTitle>
              <CardDescription className="text-amber-700 dark:text-amber-300">
                A fase de Edição detectou estas menções. Cadastre manualmente abaixo
                os links que quiser incluir.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {mentionedLinks.map((mention, index) => (
                  <li key={`${mention.timestamp}-${index}`} className="flex items-start gap-2">
                    <span className="font-mono text-xs text-amber-700 dark:text-amber-300 shrink-0">
                      {mention.timestamp}
                    </span>
                    <span className="text-amber-900 dark:text-amber-100">{mention.description}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Add link form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <LinkIcon className="size-4" />
              Links do Episódio
            </CardTitle>
            <CardDescription>
              Cadastre links de referência. Marque &quot;incluir na descrição&quot; para que o
              link entre na descrição do vídeo no YouTube ao publicar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                placeholder="https://..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleAdd()
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-description">Descrição</Label>
              <Input
                id="link-description"
                placeholder="Ex.: Repositório do projeto discutido"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleAdd()
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="link-include"
                checked={newInclude}
                onCheckedChange={setNewInclude}
              />
              <Label htmlFor="link-include" className="text-sm font-normal text-muted-foreground">
                Incluir na descrição do vídeo
              </Label>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => void handleAdd()} disabled={isSaving}>
                <PlusIcon className="size-4 mr-2" />
                Adicionar link
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Existing links */}
        {links.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {links.length === 1 ? '1 link cadastrado' : `${links.length} links cadastrados`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {links.map((link, index) => (
                <div
                  key={`${link.url}-${index}`}
                  className="flex items-start gap-3 py-2 border-b last:border-b-0"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <EditableText
                      value={link.description}
                      onSave={(value) => handleDescriptionEdit(index, value)}
                      className="text-sm font-medium"
                      placeholder="Descrição do link"
                    />
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary truncate"
                    >
                      <ExternalLinkIcon className="size-3 shrink-0" />
                      <span className="truncate">{link.url}</span>
                    </a>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={link.includeInDescription}
                      onCheckedChange={(value) => void handleToggleInclude(index, value)}
                      aria-label={`Incluir ${link.description} na descrição`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleRemove(index)}
                      aria-label={`Remover ${link.description}`}
                    >
                      <Trash2Icon className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

        {/* Advance — zero links is a valid reviewed state (ADR-26.5) */}
        <div className="flex items-center justify-end gap-3 pt-4">
          {isSaving && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              Salvando...
            </span>
          )}
          <Button onClick={onAdvance} disabled={isAdvancing || isSaving}>
            {isAdvancing ? (
              <>
                Avançando...
                <Loader2Icon className="size-4 ml-2 animate-spin" />
              </>
            ) : (
              <>
                Avançar para {nextPhaseName}
                <ArrowRightIcon className="size-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
