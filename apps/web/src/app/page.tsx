import type { Metadata } from "next";
import Image from "next/image";

import { Container } from "@/components/layout/container";
import { EpisodeCard } from "@/components/episode/episode-card";
import { SubscriptionCta } from "@/components/episode/subscription-cta";
import { FeaturedEpisodeHero } from "@/components/home/featured-episode-hero";
import { getEpisodes, getLatestEpisode } from "@/lib/datastore/episodes";
import { logger } from "@/lib/logger";

import type { Episode } from "@/types";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnc.com.br";

export const metadata: Metadata = {
  alternates: {
    canonical: baseUrl,
  },
};

// SSG with ISR - revalidate every hour
export const revalidate = 3600;

export default async function HomePage() {
  let latestEpisode: Episode | null = null;
  let recentEpisodes: Episode[] = [];

  try {
    const [latest, episodes] = await Promise.all([
      getLatestEpisode(),
      getEpisodes({ limit: 9 }), // Get 9 to have 8 after filtering out latest
    ]);

    latestEpisode = latest;
    // Filter out the latest from recent list to avoid duplication
    recentEpisodes = episodes
      .filter((ep) => ep.id !== latestEpisode?.id)
      .slice(0, 8);
  } catch (error) {
    // Datastore not available - show empty state
    logger.error("Failed to fetch episodes for home page", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return (
    <Container className="py-8 lg:py-12">
      {/* Hero Section with Podcast Description */}
      <header className="mb-10 text-center lg:mb-12">
        <h1>
          <span className="sr-only">PPT Não Compila: Podcast de Tecnologia</span>
          <Image
            src="/pptnc_logo.png"
            alt=""
            width={588}
            height={360}
            className="mx-auto h-32 w-auto sm:h-40"
            priority
            aria-hidden="true"
          />
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          O principal podcast de tecnologia do Brasil. Toda semana, conversas com
          especialistas sobre inteligência artificial, transformação digital, carreira
          tech e as tendências que moldam o futuro da tecnologia.
        </p>
      </header>

      {/* Featured Episode Section */}
      {latestEpisode ? (
        <section aria-labelledby="featured-episode-title">
          <h2 id="featured-episode-title" className="mb-6 text-xl font-semibold text-primary">
            Episódio mais recente
          </h2>
          <FeaturedEpisodeHero episode={latestEpisode} />
        </section>
      ) : (
        <section className="rounded-lg border border-dashed p-8 text-center">
          <span className="text-4xl">🎙️</span>
          <h2 className="mt-4 text-xl font-semibold">Nenhum episódio ainda</h2>
          <p className="mt-2 text-muted-foreground">
            Os episódios aparecerão aqui quando estiverem disponíveis.
          </p>
        </section>
      )}

      {/* Recent Episodes Section */}
      {recentEpisodes.length > 0 && (
        <section className="mt-12 border-t border-border/50 pt-8" aria-labelledby="recent-episodes-title">
          <h2 id="recent-episodes-title" className="mb-6 text-xl font-semibold text-primary">
            Episódios anteriores
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recentEpisodes.map((episode) => (
              <article key={episode.id}>
                <EpisodeCard episode={episode} variant="compact" />
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Subscription CTA */}
      <section className="mt-12 lg:mt-16">
        <SubscriptionCta />
      </section>
    </Container>
  );
}
