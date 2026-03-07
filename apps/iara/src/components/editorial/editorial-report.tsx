/**
 * Editorial Report - Presentation Component
 *
 * Renders the full editorial report for an episode:
 * - Episode title, critique, description
 * - Guest cards (all equal, grid 2-col, with photo link and initials fallback)
 * - Chapters list
 * - YouTube footer + tags
 * - Cuts section (with shortTitle label)
 * - Reels section
 *
 * Print-friendly layout with @media print CSS.
 *
 * @see story-11-4-relatorio-editorial.md
 */

import { ExternalLinkIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { resolveFooterPlaceholders } from '@/lib/youtube/format-chapters'
import type { Video } from '@/types/video'

interface EditorialReportProps {
  video: Video
  cuts: Video[]
  reels: Video[]
  youtubeFooter?: string
}

export function EditorialReport({ video, cuts, reels, youtubeFooter }: EditorialReportProps) {
  const guests = video.guests ?? []
  const chapters = video.chapters ?? []
  const tags = video.tags ?? []

  return (
    <main
      className="mx-auto max-w-3xl bg-background px-6 py-10 text-foreground print:px-4 print:py-2"
      style={{
        /* Light theme overrides — the app is dark-only, but this public page needs readable dark-on-light text */
        '--color-background': 'oklch(1 0 0)',
        '--color-foreground': 'oklch(0.15 0.01 260)',
        '--color-card': 'oklch(0.98 0.005 260)',
        '--color-card-foreground': 'oklch(0.15 0.01 260)',
        '--color-muted': 'oklch(0.93 0.005 260)',
        '--color-muted-foreground': 'oklch(0.45 0.01 260)',
        '--color-secondary': 'oklch(0.93 0.005 260)',
        '--color-secondary-foreground': 'oklch(0.15 0.01 260)',
        '--color-primary': 'oklch(0.55 0.15 250)',
        '--color-primary-foreground': 'oklch(0.98 0.005 260)',
        '--color-border': 'oklch(0.85 0.005 260)',
        '--color-accent': 'oklch(0.93 0.005 260)',
        '--color-accent-foreground': 'oklch(0.15 0.01 260)',
      } as React.CSSProperties}
    >
      {/* Episode Title */}
      <h1 className="text-3xl font-bold tracking-tight">{video.title}</h1>

      <Separator className="my-6" />

      {/* Critique */}
      {video.critique && (
        <>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <p className="whitespace-pre-line text-sm leading-relaxed">{video.critique}</p>
            </CardContent>
          </Card>
          <Separator className="my-6" />
        </>
      )}

      {/* Description */}
      {video.description && (
        <section className="mb-8">
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {video.description}
          </p>
        </section>
      )}

      {/* Guests */}
      {guests.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Participantes</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {guests.map((guest, i) => (
              <div key={i} className="flex items-center gap-5 rounded-lg border p-4">
                <GuestAvatar name={guest.name} photo={guest.photo} />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-sm">{guest.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {guest.role}{guest.company ? ` · ${guest.company}` : ''}
                  </p>
                  {guest.linkedin && (
                    <a
                      href={guest.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      LinkedIn <ExternalLinkIcon className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Chapters */}
      {chapters.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Capítulos</h2>
          <ul className="space-y-1">
            {chapters.map((chapter, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm">
                <span className="font-mono text-muted-foreground">{chapter.timestamp}</span>
                <span>{chapter.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* YouTube Footer + Tags */}
      {(youtubeFooter || tags.length > 0) && (
        <section className="mb-8">
          {youtubeFooter && (
            <div className="mb-4">
              <p className="whitespace-pre-line text-sm text-muted-foreground">{resolveFooterPlaceholders(youtubeFooter, video)}</p>
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag, i) => (
                <Badge key={i} variant="secondary" className="rounded-full px-2 py-0.5 text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Cuts Section */}
      {cuts.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-bold">Cortes</h2>
          {cuts.map((cut, i) => (
            <div key={cut.id} className="print:break-inside-avoid">
              <h3 className="text-lg font-semibold">{cut.title}</h3>
              {cut.shortTitle && (
                <p className="mt-1 text-sm">
                  <span className="font-medium">Título para thumb:</span>{' '}
                  <Badge className="bg-primary/10 text-primary font-semibold">
                    {cut.shortTitle}
                  </Badge>
                </p>
              )}
              {cut.description && (
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {cut.description}
                </p>
              )}
              {youtubeFooter && (
                <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                  {resolveFooterPlaceholders(youtubeFooter, video)}
                </p>
              )}
              {cut.tags && cut.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cut.tags.map((tag, j) => (
                    <Badge key={j} variant="secondary" className="rounded-full px-2 py-0.5 text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              {i < cuts.length - 1 && <Separator className="my-6" />}
            </div>
          ))}
        </section>
      )}

      {/* Reels Section */}
      {reels.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-bold">Reels</h2>
          {reels.map((reel, i) => (
            <div key={reel.id} className="print:break-inside-avoid">
              <h3 className="text-lg font-semibold">{reel.title}</h3>
              {reel.description && (
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {reel.description}
                </p>
              )}
              {youtubeFooter && (
                <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                  {resolveFooterPlaceholders(youtubeFooter, video)}
                </p>
              )}
              {reel.tags && reel.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {reel.tags.map((tag, j) => (
                    <Badge key={j} variant="secondary" className="rounded-full px-2 py-0.5 text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              {i < reels.length - 1 && <Separator className="my-6" />}
            </div>
          ))}
        </section>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          nav, header, footer, .sidebar, [data-sidebar] { display: none !important; }
          body { background: white !important; color: black !important; }
          main { max-width: 100% !important; padding: 0 !important; }
        }
      `}</style>
    </main>
  )
}

/** Guest avatar with initials fallback. Photo links to full image in new tab. */
function GuestAvatar({
  name,
  photo,
}: {
  name: string
  photo?: string
}) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  if (photo) {
    return (
      <a href={photo} target="_blank" rel="noopener noreferrer" className="shrink-0" title={`Foto de ${name}`}>
        <img
          src={photo}
          alt={name}
          className="size-24 rounded-full object-cover ring-2 ring-border transition-opacity hover:opacity-80"
        />
      </a>
    )
  }

  return (
    <div
      className="size-24 flex shrink-0 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground"
    >
      {initials}
    </div>
  )
}
