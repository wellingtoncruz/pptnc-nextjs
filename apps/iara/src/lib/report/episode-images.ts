/**
 * Imagens do episódio no Relatório Editorial — thumbnail + imagens extras.
 *
 * O relatório (`/report/[videoId]`) é público, mas o bucket não é: os proxies
 * do wizard (`/api/wizard/thumbnail/select`, `/api/wizard/extra-images/select`)
 * exigem sessão. Para o relatório servir as artes a quem recebe o link, existe
 * `/api/report/[videoId]/image?kind=...`, que lê o path do **próprio documento
 * do vídeo** — nunca do querystring. Isso é o que impede a rota pública de
 * virar um leitor genérico do bucket.
 *
 * Este módulo é a fonte única de "que imagens esse episódio tem": a rota usa
 * para resolver o arquivo e o componente usa para decidir o que renderizar.
 * Se divergissem, o relatório mostraria cards com imagem quebrada.
 */

import { EXTRA_IMAGE_KINDS, EXTRA_IMAGE_LABELS } from '@/lib/schemas/podcast'
import type { Video } from '@/types/video'

/** Thumbnail + as três extras, na ordem em que aparecem no relatório. */
export const REPORT_IMAGE_KINDS = ['thumbnail', ...EXTRA_IMAGE_KINDS] as const

export type ReportImageKind = (typeof REPORT_IMAGE_KINDS)[number]

export const REPORT_IMAGE_LABELS: Record<ReportImageKind, string> = {
  thumbnail: 'Thumbnail',
  ...EXTRA_IMAGE_LABELS,
}

const REPORT_IMAGE_KIND_SET: ReadonlySet<string> = new Set(REPORT_IMAGE_KINDS)

export function isReportImageKind(value: string): value is ReportImageKind {
  return REPORT_IMAGE_KIND_SET.has(value)
}

/**
 * Extrai o path GCS da URL persistida no documento do vídeo.
 *
 * Aceita só os dois proxies finais. Um `storageThumbnailUrl` antigo apontando
 * para outro lugar (URL do YouTube, por exemplo) devolve `null` e a imagem
 * simplesmente não entra no relatório — melhor do que um card quebrado.
 */
export function extractStoredImagePath(imageUrl: string | undefined | null): string | null {
  if (!imageUrl) return null
  const match = imageUrl.match(
    /\/api\/wizard\/(?:thumbnail|extra-images)\/select\?path=([^&]+)/
  )
  if (!match) return null
  try {
    const decoded = decodeURIComponent(match[1])
    // Defesa em profundidade: os downloads do cloud-storage já barram `..`,
    // mas um path assim nunca deveria ter sido gravado — não vale renderizar.
    return decoded.includes('..') ? null : decoded
  } catch {
    return null
  }
}

/** URL persistida de um kind, sem interpretar o formato. */
export function getStoredImageUrl(video: Video, kind: ReportImageKind): string | undefined {
  return kind === 'thumbnail' ? video.storageThumbnailUrl : video.extraImages?.[kind]
}

export interface ReportImage {
  kind: ReportImageKind
  label: string
  /** `<img src>` — sem `download=1`, para o browser cachear a mesma resposta. */
  src: string
  /** `<a href>` do botão Baixar — força `Content-Disposition: attachment`. */
  downloadHref: string
}

/**
 * As imagens que o relatório deve exibir, em ordem, já filtradas pelas que
 * têm um path resolvível. Retorna `[]` quando o episódio não gerou nenhuma —
 * o caso normal para vídeos anteriores aos Epics 22/28.
 */
export function getReportImages(video: Video): ReportImage[] {
  const base = `/api/report/${encodeURIComponent(video.id)}/image`
  return REPORT_IMAGE_KINDS.filter(
    (kind) => extractStoredImagePath(getStoredImageUrl(video, kind)) !== null
  ).map((kind) => ({
    kind,
    label: REPORT_IMAGE_LABELS[kind],
    src: `${base}?kind=${kind}`,
    downloadHref: `${base}?kind=${kind}&download=1`,
  }))
}

/** Extensão do arquivo no bucket, para nomear o download. */
export function fileExtensionFromPath(filePath: string, fallback = 'png'): string {
  const ext = filePath.split('/').pop()?.split('.').pop()?.toLowerCase()
  return ext && /^[a-z0-9]{2,4}$/.test(ext) ? ext : fallback
}
