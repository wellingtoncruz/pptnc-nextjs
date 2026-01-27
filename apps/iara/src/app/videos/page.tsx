import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { auth } from '@/lib/auth'
import { VideosLayout } from './videos-layout'

/**
 * Videos page - Server Component for authentication.
 * Delegates rendering to VideosLayout client component.
 */
export default async function VideosPage() {
  const session = await auth()

  // Redirect to login if no session or session has an error
  // (e.g., UserNotFoundError when user was deleted from Firestore)
  if (!session || session.error) {
    redirect('/login')
  }

  return (
    <main className="h-screen overflow-hidden bg-background">
      <Suspense fallback={<VideosPageSkeleton />}>
        <VideosLayout userName={session.user.name ?? undefined} />
      </Suspense>
    </main>
  )
}

/**
 * Loading skeleton for the videos page.
 */
function VideosPageSkeleton() {
  return (
    <div className="flex h-screen">
      {/* Sidebar skeleton */}
      <div className="w-48 border-r border-border bg-background" />
      {/* List skeleton */}
      <div className="flex-1 border-r border-border bg-background" />
      {/* Detail skeleton */}
      <div className="flex-1 bg-background" />
    </div>
  )
}
