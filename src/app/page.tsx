import { Search } from "lucide-react";

import { Container } from "@/components/layout/container";
import { EpisodeCard } from "@/components/episode/episode-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getEpisodes, getLatestEpisode } from "@/lib/datastore/episodes";

import type { Episode } from "@/types";

// SSG with ISR - revalidate every hour
export const revalidate = 3600;

export default async function HomePage() {
  let latestEpisode: Episode | null = null;
  let otherEpisodes: Episode[] = [];

  try {
    const [latest, recent] = await Promise.all([
      getLatestEpisode(),
      getEpisodes({ limit: 4 }),
    ]);

    latestEpisode = latest;
    // Filter out the latest from recent list to avoid duplication
    otherEpisodes = recent
      .filter((ep) => ep.id !== latestEpisode?.id)
      .slice(0, 3);
  } catch (error) {
    // Datastore not available - show empty state
    console.error("Failed to fetch episodes:", error);
  }

  return (
    <Container className="py-8 lg:py-12">
      {/* Hero Section */}
      <section>
        <h1 className="sr-only">PPT Não Compila - Podcast</h1>

        {/* Search Box */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            O que você quer saber?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Pesquise qualquer tema técnico e descubra o que nossos especialistas
            já discutiram
          </p>

          {/* Search Input - Visual placeholder for Epic 4 */}
          <div className="mt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Busca semântica em breve..."
                className="h-12 pl-10 pr-24"
                disabled
                aria-label="Campo de busca semântica - em breve"
              />
              <Button
                className="absolute right-1 top-1/2 -translate-y-1/2"
                size="sm"
                disabled
              >
                Pesquisar
              </Button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              💡 A busca semântica com IA estará disponível em breve
            </p>
          </div>
        </div>
      </section>

      {/* Featured Episode Section */}
      {latestEpisode ? (
        <section className="mt-12 lg:mt-16">
          <h2 className="mb-6 text-xl font-semibold">Episódio mais recente</h2>
          <article>
            <EpisodeCard episode={latestEpisode} variant="featured" />
          </article>
        </section>
      ) : (
        <section className="mt-12 rounded-lg border border-dashed p-8 text-center lg:mt-16">
          <span className="text-4xl">🎙️</span>
          <h2 className="mt-4 text-xl font-semibold">Nenhum episódio ainda</h2>
          <p className="mt-2 text-muted-foreground">
            Os episódios aparecerão aqui quando estiverem disponíveis.
          </p>
        </section>
      )}

      {/* Recent Episodes Section */}
      {otherEpisodes.length > 0 && (
        <section className="mt-12 border-t pt-8">
          <h2 className="mb-6 text-xl font-semibold">Episódios anteriores</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {otherEpisodes.map((episode) => (
              <article key={episode.id}>
                <EpisodeCard episode={episode} variant="compact" />
              </article>
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
