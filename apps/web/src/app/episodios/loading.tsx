import { Container } from "@/components/layout/container";
import { EpisodeCardSkeleton } from "@/components/episode/episode-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading state for the episodes listing page.
 * Shows skeletons matching the page structure.
 */
export default function EpisodesLoading() {
  return (
    <Container className="py-8 lg:py-12">
      {/* Header skeleton */}
      <header>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="mt-2 h-5 w-72" />
      </header>

      {/* Topic filters skeleton */}
      <section className="mt-6" aria-busy="true" aria-label="Carregando filtros">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      </section>

      {/* Count skeleton */}
      <Skeleton className="mt-4 h-4 w-48" />

      {/* Episodes grid skeleton */}
      <section
        className="mt-6"
        aria-busy="true"
        aria-label="Carregando episódios"
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <EpisodeCardSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Pagination skeleton */}
      <nav className="mt-8 flex items-center justify-center gap-2">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-20" />
      </nav>
    </Container>
  );
}
