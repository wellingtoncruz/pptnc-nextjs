import { Container } from "@/components/layout/container";
import { EpisodeCardSkeleton } from "@/components/episode/episode-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading state for the home page.
 * Shows skeletons matching the page structure.
 */
export default function HomeLoading() {
  return (
    <Container className="py-8 lg:py-12">
      {/* Hero Section skeleton */}
      <header className="mb-10 text-center lg:mb-12">
        <Skeleton className="mx-auto h-10 w-64" />
        <Skeleton className="mx-auto mt-3 h-6 w-full max-w-2xl" />
        <Skeleton className="mx-auto mt-2 h-6 w-5/6 max-w-xl" />
      </header>

      {/* Featured Episode Section skeleton */}
      <section aria-busy="true" aria-label="Carregando episódio em destaque">
        <Skeleton className="mb-6 h-7 w-48" />
        <EpisodeCardSkeleton variant="featured" />
      </section>

      {/* Recent Episodes Section skeleton */}
      <section
        className="mt-12 border-t border-border/50 pt-8"
        aria-busy="true"
        aria-label="Carregando episódios recentes"
      >
        <Skeleton className="mb-6 h-7 w-44" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <EpisodeCardSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* CTA Section skeleton */}
      <section className="mt-12 lg:mt-16">
        <Skeleton className="h-48 w-full rounded-lg" />
      </section>
    </Container>
  );
}
