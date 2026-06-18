/**
 * LegalPage — shared shell for static public legal documents.
 *
 * Used by the Privacy Policy (/privacy) and Terms of Service (/terms) pages so
 * both follow the exact same visual standard and layout. Keeps the app's
 * dark theme (consistent with the login page), centered prose container,
 * logo header and cross-links footer.
 *
 * Public pages: no auth required (excluded from the proxy matcher).
 */

import Image from 'next/image'
import Link from 'next/link'

import { Separator } from '@/components/ui/separator'

interface LegalPageProps {
  /** Document title shown in the header (e.g. "Política de Privacidade"). */
  title: string
  /** Human-readable last-updated date (e.g. "18 de junho de 2026"). */
  lastUpdated: string
  /** Document body — use the exported Section/Paragraph/List helpers. */
  children: React.ReactNode
}

export function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* Header */}
        <header className="mb-8 flex flex-col items-center gap-4 text-center">
          <Link href="/login" className="inline-block">
            <Image
              src="/IAra_logo.png"
              alt="IAra"
              width={72}
              height={72}
              className="rounded-2xl"
              priority
            />
          </Link>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">
              Última atualização: {lastUpdated}
            </p>
          </div>
        </header>

        <Separator className="mb-8" />

        {/* Body */}
        <article className="space-y-8 text-sm leading-relaxed text-foreground/90">
          {children}
        </article>

        <Separator className="my-10" />

        {/* Footer */}
        <footer className="flex flex-col items-center gap-3 text-center text-xs text-muted-foreground">
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Política de Privacidade
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Termos de Serviço
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Voltar ao login
            </Link>
          </nav>
          <p>© {new Date().getFullYear()} IAra · PPT Não Compila</p>
        </footer>
      </div>
    </main>
  )
}

/** A titled section of a legal document. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  )
}

/** A paragraph of body text. */
export function Paragraph({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>
}

/** A bulleted list of items. */
export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}
