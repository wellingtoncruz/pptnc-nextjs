import Link from "next/link";

import { Container } from "@/components/layout/container";
import { EpisodeCard } from "@/components/episode/episode-card";
import { TopicFilter } from "@/components/episode/topic-filter";
import { Button } from "@/components/ui/button";
import {
  getEpisodes,
  getEpisodesCount,
  getEpisodesByTopic,
  getEpisodesCountByTopic,
  getAllTopics,
} from "@/lib/datastore/episodes";

import { logger } from "@/lib/logger";

import type { Metadata } from "next";
import type { Episode } from "@/types";

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnc.com.br";

export const metadata: Metadata = {
  title: "Todos os Episódios do Podcast de Tecnologia",
  description:
    "Explore +200 episódios do podcast de tecnologia PPT Não Compila. Entrevistas com especialistas sobre IA, cloud, carreira tech e transformação digital.",
  alternates: {
    canonical: `${baseUrl}/episodios`,
  },
  openGraph: {
    title: "Episódios | PPT Não Compila - Podcast de Tecnologia",
    description:
      "Explore +200 episódios do podcast de tecnologia PPT Não Compila. Entrevistas com especialistas sobre IA, cloud, carreira tech e transformação digital.",
    url: "/episodios",
  },
  twitter: {
    title: "Episódios | PPT Não Compila - Podcast de Tecnologia",
    description:
      "Explore +200 episódios do podcast de tecnologia PPT Não Compila. Entrevistas com especialistas sobre IA, cloud, carreira tech e transformação digital.",
  },
};

// SSG with ISR - revalidate every hour
export const revalidate = 3600;

const EPISODES_PER_PAGE = 12;

interface EpisodesPageProps {
  searchParams: Promise<{ page?: string; topic?: string }>;
}

export default async function EpisodesPage({ searchParams }: EpisodesPageProps) {
  const params = await searchParams;
  const parsedPage = parseInt(params.page || "1", 10);
  const page = Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage);
  const offset = (page - 1) * EPISODES_PER_PAGE;
  const activeTopic = params.topic;

  let episodes: Episode[] = [];
  let totalCount = 0;
  let topics: string[] = [];

  try {
    // Execute ALL queries in parallel for maximum performance
    if (activeTopic) {
      // Filtered by topic - 3 parallel queries
      [episodes, totalCount, topics] = await Promise.all([
        getEpisodesByTopic(activeTopic, { limit: EPISODES_PER_PAGE, offset }),
        getEpisodesCountByTopic(activeTopic),
        getAllTopics(),
      ]);
    } else {
      // All episodes - 3 parallel queries
      [episodes, totalCount, topics] = await Promise.all([
        getEpisodes({ limit: EPISODES_PER_PAGE, offset }),
        getEpisodesCount(),
        getAllTopics(),
      ]);
    }
  } catch (error) {
    logger.error("Failed to fetch episodes", {
      page,
      activeTopic,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const totalPages = Math.ceil(totalCount / EPISODES_PER_PAGE) || 1;
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  // Build pagination URL preserving topic param
  const buildPageUrl = (pageNum: number) => {
    const urlParams = new URLSearchParams();
    urlParams.set("page", pageNum.toString());
    if (activeTopic) {
      urlParams.set("topic", activeTopic);
    }
    return `/episodios?${urlParams.toString()}`;
  };

  return (
    <Container className="py-8 lg:py-12">
      <header>
        <h1 className="text-3xl font-bold text-primary">Episódios</h1>
        <p className="mt-2 text-muted-foreground">
          Explore todos os episódios do PPT Não Compila
        </p>
      </header>

      {/* Topic Filters */}
      {topics.length > 0 && (
        <section className="mt-6" aria-label="Filtros">
          <TopicFilter topics={topics} activeTopic={activeTopic} />
        </section>
      )}

      {/* Episode count */}
      {totalCount > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Mostrando {Math.min(offset + 1, totalCount)}-
          {Math.min(offset + EPISODES_PER_PAGE, totalCount)} de {totalCount}{" "}
          episódios
          {activeTopic && ` em "${activeTopic}"`}
        </p>
      )}

      {episodes.length > 0 ? (
        <>
          <section className="mt-6" aria-labelledby="episodes-list-title">
            <h2 id="episodes-list-title" className="sr-only">
              Lista de episódios
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {episodes.map((episode) => (
                <article key={episode.id}>
                  <EpisodeCard episode={episode} variant="compact" />
                </article>
              ))}
            </div>
          </section>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav
              className="mt-8 flex items-center justify-center gap-2"
              aria-label="Paginação de episódios"
            >
              {hasPrevPage ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildPageUrl(page - 1)}>Anterior</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Anterior
                </Button>
              )}

              <span className="px-4 text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </span>

              {hasNextPage ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={buildPageUrl(page + 1)}>Próxima</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Próxima
                </Button>
              )}
            </nav>
          )}
        </>
      ) : (
        <EmptyState activeTopic={activeTopic} />
      )}
    </Container>
  );
}

function EmptyState({ activeTopic }: { activeTopic?: string }) {
  return (
    <section className="mt-12 rounded-lg border border-dashed p-8 text-center">
      <span className="text-4xl">🎙️</span>
      <h2 className="mt-4 text-xl font-semibold">
        {activeTopic
          ? `Nenhum episódio em "${activeTopic}"`
          : "Nenhum episódio ainda"}
      </h2>
      <p className="mt-2 text-muted-foreground">
        {activeTopic
          ? "Tente outro tópico ou veja todos os episódios."
          : "Os episódios aparecerão aqui quando estiverem disponíveis."}
      </p>
      <Button asChild className="mt-6">
        <Link href={activeTopic ? "/episodios" : "/"}>
          {activeTopic ? "Ver todos os episódios" : "Voltar para Home"}
        </Link>
      </Button>
    </section>
  );
}
