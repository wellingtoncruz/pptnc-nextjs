import { Container } from "@/components/layout/container";
import { EpisodeCardSkeleton } from "@/components/episode/episode-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading state for the episode detail page.
 * Shows skeletons for video player, metadata, and content tabs.
 */
export default function EpisodeLoading() {
  return (
    <Container className="py-8 md:py-12">
      <div
        className="space-y-6"
        role="status"
        aria-busy="true"
        aria-label="Carregando episódio"
      >
        {/* Video Player skeleton - 16:9 aspect ratio */}
        <Skeleton className="aspect-video w-full rounded-lg" />

        {/* Title and metadata */}
        <div className="space-y-4">
          {/* Title */}
          <Skeleton className="h-8 w-3/4" />

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>

          {/* Topics */}
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        </div>

        {/* Social sharing buttons skeleton */}
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>

        {/* Tabs skeleton */}
        <div className="flex gap-2 border-b">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-28" />
        </div>

        {/* Tab content skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Related episodes skeleton */}
        <div className="mt-8 border-t pt-8">
          <Skeleton className="mb-4 h-6 w-40" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <EpisodeCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </Container>
  );
}
