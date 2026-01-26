import { redirect } from 'next/navigation'

import { auth, signOut } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export default async function LogoutPage() {
  const session = await auth()

  // If not authenticated, redirect to login
  if (!session) {
    redirect('/login')
  }

  // Perform logout
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form
        action={async () => {
          'use server'
          await signOut({ redirectTo: '/login' })
        }}
        className="text-center space-y-4"
      >
        <p className="text-muted-foreground">
          Logado como <strong>{session.user?.email}</strong>
        </p>
        <Button type="submit" variant="destructive">
          Sair da conta
        </Button>
      </form>
    </div>
  )
}
