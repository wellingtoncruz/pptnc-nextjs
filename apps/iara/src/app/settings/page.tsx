import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { auth } from '@/lib/auth'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { PODCAST_ID } from '@/lib/firebase/config'
import { SettingsPageClient } from '@/components/settings/settings-page-client'
import { UserMenu } from '@/components/auth/user-menu'
import { LogoutNavButton } from '@/components/layout/logout-nav-button'
import { SettingsNavLink } from '@/components/layout/settings-nav-link'
import type { Podcast } from '@/types/podcast'

/**
 * Serializes a Podcast for passing to Client Components.
 * Converts Firestore Timestamps to ISO strings.
 */
function serializePodcast(podcast: Podcast) {
  return {
    ...podcast,
    createdAt: podcast.createdAt.toDate().toISOString(),
    updatedAt: podcast.updatedAt.toDate().toISOString(),
  }
}

export type SerializedPodcast = ReturnType<typeof serializePodcast>

/**
 * Settings page - Server Component.
 *
 * Fetches podcast data server-side and passes to client form.
 * Requires authentication.
 */
export default async function SettingsPage() {
  const session = await auth()

  // Redirect to login if no session or session has an error
  // (e.g., UserNotFoundError when user was deleted from Firestore)
  if (!session || session.error) {
    redirect('/login')
  }

  const podcast = await getPodcastAdmin(PODCAST_ID)

  if (!podcast) {
    return (
      <main className="min-h-screen bg-background">
        <SettingsHeader />
        <div className="container max-w-2xl py-8">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
            <h2 className="text-lg font-semibold text-destructive">
              Podcast não encontrado
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              O podcast com ID &quot;{PODCAST_ID}&quot; não existe no Firestore.
              Verifique a configuração em lib/firebase/config.ts.
            </p>
          </div>
        </div>
      </main>
    )
  }

  // Serialize for Client Component (converts Timestamps to strings)
  const serializedPodcast = serializePodcast(podcast)

  return (
    <main className="min-h-screen bg-background">
      <SettingsHeader />
      <div className="container max-w-2xl py-8">
        <div className="mb-6">
          <Link
            href="/videos"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para vídeos
          </Link>
        </div>
        <h1 className="text-2xl font-bold mb-6">Configurações</h1>
        <SettingsPageClient podcast={serializedPodcast} />
      </div>
    </main>
  )
}

function SettingsHeader() {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold">IAra</h1>
        <nav className="flex items-center gap-2">
          <SettingsNavLink />
          <LogoutNavButton />
        </nav>
      </div>
      <UserMenu />
    </header>
  )
}
