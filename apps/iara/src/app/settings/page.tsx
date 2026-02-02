import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'

/**
 * Settings page - Server Component.
 *
 * Redirects to /videos?view=settings to maintain sidebar layout.
 * The standalone /settings route is kept for backwards compatibility
 * and to enforce admin-only access via server-side check.
 *
 * @see docs/stories/8-1-modelo-roles-permissoes.md
 * @see docs/stories/8-2-secoes-colapsaveis.md
 */
export default async function SettingsPage() {
  const session = await auth()

  // Redirect to login if no session or session has an error
  // (e.g., UserNotFoundError when user was deleted from Firestore)
  if (!session || session.error) {
    redirect('/login')
  }

  // Redirect non-admins to videos page
  // Admin check: only users with role='admin' can access settings
  if (session.user.role !== 'admin') {
    redirect('/videos')
  }

  // Redirect to videos?view=settings to maintain sidebar layout
  redirect('/videos?view=settings')
}
