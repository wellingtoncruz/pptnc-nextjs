import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface EpisodeCardSkeletonProps {
  /** Display variant - "featured" for hero section, "compact" for listings */
  variant?: "featured" | "compact";
}

/**
 * Skeleton loader for EpisodeCard component.
 * Matches the exact structure of EpisodeCard for smooth transitions.
 */
export function EpisodeCardSkeleton({
  variant = "compact",
}: EpisodeCardSkeletonProps) {
  if (variant === "featured") {
    return (
      <Card className="overflow-hidden">
        {/* Thumbnail skeleton */}
        <Skeleton className="aspect-video w-full" />

        <CardContent className="p-6">
          {/* Title */}
          <Skeleton className="h-8 w-3/4" />

          {/* Description */}
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-1 h-4 w-5/6" />
          <Skeleton className="mt-1 h-4 w-4/6" />

          {/* Metadata */}
          <div className="mt-4 flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>

          {/* Topics */}
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Compact variant - matches vertical card layout
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      {/* Thumbnail - 16:9 aspect ratio */}
      <Skeleton className="aspect-video w-full shrink-0" />

      <CardContent className="flex flex-1 flex-col p-4">
        {/* Title - 3 lines */}
        <Skeleton className="h-5 w-full" />
        <Skeleton className="mt-1 h-5 w-5/6" />
        <Skeleton className="mt-1 h-5 w-4/6" />

        {/* Guests */}
        <Skeleton className="mt-2 h-4 w-2/3" />

        {/* Date - pushed to bottom */}
        <Skeleton className="mt-auto pt-2 h-4 w-24" />

        {/* Topics */}
        <div className="mt-2 flex gap-1">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}
