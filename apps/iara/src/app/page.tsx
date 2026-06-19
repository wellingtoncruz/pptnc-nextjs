/**
 * Public Homepage / Landing (Server Component)
 *
 * Public route: `/` (allowed without auth by the proxy). This is the app's
 * homepage for the Google OAuth consent screen — it must be publicly reachable
 * and include a visible link to the Privacy Policy (and Terms).
 *
 * Authenticated users are redirected straight to the app (/videos).
 */

import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

import { auth, signIn } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { GoogleIcon } from '@/components/auth/google-icon'

export default async function HomePage() {
  // Send already-authenticated users to the app.
  const session = await auth()
  if (session && !session.error) {
    redirect('/videos')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-background p-6">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <Image
          src="/IAra_logo.png"
          alt="IAra"
          width={120}
          height={120}
          className="rounded-2xl"
          priority
        />

        <h1 className="mt-6 text-3xl font-bold tracking-tight">IAra</h1>
        <p className="mt-2 text-muted-foreground">
          A Inteligência Artificial do PPT Não Compila
        </p>

        <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
          Plataforma de automação de metadados para vídeos de podcast. A IAra ajuda a
          gerar e gerenciar títulos, descrições, capítulos e tags dos vídeos do canal no
          YouTube, agilizando a publicação dos episódios.
        </p>

        <form
          className="mt-8"
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: '/videos' })
          }}
        >
          <Button
            type="submit"
            variant="secondary"
            className="gap-2 bg-white text-gray-900 hover:bg-gray-100 border border-gray-300"
          >
            <GoogleIcon />
            Entrar com Google
          </Button>
        </form>
      </div>

      <footer className="mt-10 text-center text-xs text-muted-foreground">
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Política de Privacidade
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Termos de Serviço
          </Link>
        </nav>
        <p className="mt-3">© {new Date().getFullYear()} IAra · PPT Não Compila</p>
      </footer>
    </main>
  )
}
