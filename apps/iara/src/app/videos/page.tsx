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
 * Matches the actual MasterDetailLayout structure:
 * - Fixed sidebar (w-48)
 * - Resizable list panel (~40%)
 * - Resizable detail panel (~60%)
 */
function VideosPageSkeleton() {
  return (
    <div className="flex h-screen">
      {/* Sidebar skeleton - fixed width matching Sidebar component */}
      <div className="w-48 shrink-0 border-r border-border bg-background" />
      {/* List panel skeleton - approximately 40% of remaining space */}
      <div className="w-[40%] border-r border-border bg-background" />
      {/* Detail panel skeleton - approximately 60% of remaining space */}
      <div className="flex-1 bg-background" />
    </div>
  )
}
