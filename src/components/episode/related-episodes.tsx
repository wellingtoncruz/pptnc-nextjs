import { EpisodeCard } from "./episode-card";
import { cn } from "@/lib/utils";
import type { Episode } from "@/types";

export interface RelatedEpisodesProps {
  episodes: Episode[];
  className?: string;
}

/**
 * Displays a grid of related episodes based on shared topics.
 * Uses compact EpisodeCard variant in a responsive grid layout.
 * Does not render if the episodes array is empty.
 *
 * @param props - Component props
 * @param props.episodes - Array of related episodes to display
 * @param props.className - Optional additional CSS classes
 */
export function RelatedEpisodes({ episodes, className }: RelatedEpisodesProps) {
  if (episodes.length === 0) {
    return null;
  }

  return (
    <section
      className={cn("space-y-4", className)}
      aria-labelledby="related-episodes-title"
    >
      <h2 id="related-episodes-title" className="text-2xl font-semibold">
        Episódios Relacionados
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {episodes.map((episode) => (
          <EpisodeCard key={episode.id} episode={episode} variant="compact" />
        ))}
      </div>
    </section>
  );
}
