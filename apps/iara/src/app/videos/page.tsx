import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { UserMenu } from '@/components/auth/user-menu'
import { LogoutNavButton } from '@/components/layout/logout-nav-button'
import { SettingsNavLink } from '@/components/layout/settings-nav-link'

export default async function VideosPage() {
  const session = await auth()

  // Redirect to login if no session or session has an error
  // (e.g., UserNotFoundError when user was deleted from Firestore)
  if (!session || session.error) {
    redirect('/login')
  }

  return (
    <main className="min-h-screen bg-background">
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
      <div
        className="flex flex-col items-center justify-center p-6"
        style={{ minHeight: 'calc(100vh - 73px)' }}
      >
        <h2 className="text-2xl font-semibold">Video Pipeline</h2>
        <p className="mt-2 text-muted-foreground">
          Bem-vindo, {session.user.name}! A lista de vídeos será implementada em breve.
        </p>
      </div>
    </main>
  )
}
