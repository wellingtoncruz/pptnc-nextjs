import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { EpisodeYouTubeWrapper } from "@/components/episode";
import { EpisodeJsonLd } from "@/components/seo";
import {
  getEpisodeBySlug,
  getEpisodeBySlugWithTranscript,
  getEpisodes,
  getRelatedEpisodes,
} from "@/lib/datastore/episodes";
import { getChaptersByVideoId } from "@/lib/datastore/chunks";

interface EpisodePageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    t?: string;
    tab?: string;
  }>;
}

/**
 * Generate static params for all episode pages (SSG)
 * Pre-renders all episode pages at build time
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const episodes = await getEpisodes();
  return episodes.map((episode) => ({ slug: episode.slug }));
}

/**
 * ISR - revalidate every hour to pick up new episodes
 */
export const revalidate = 3600;

/**
 * Generate dynamic metadata for SEO
 * Sets og:title, og:description, og:image from episode data
 */
export async function generateMetadata({
  params,
}: EpisodePageProps): Promise<Metadata> {
  const { slug } = await params;
  const episode = await getEpisodeBySlug(slug);

  if (!episode) {
    return { title: "Episodio nao encontrado" };
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnaocompila.com.br";
  const canonicalUrl = `${baseUrl}/episodios/${episode.slug}`;

  // Truncate description at word boundary for better SEO
  const truncateAtWord = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    return lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
  };

  const description =
    (episode.description && truncateAtWord(episode.description, 160)) ||
    `Assista ao episodio ${episode.title} do PPT Nao Compila`;

  return {
    title: episode.title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "video.episode",
      title: episode.title,
      description,
      url: canonicalUrl,
      images: [
        {
          url: episode.thumbnailUrl || "/og-image.png",
          width: 1280,
          height: 720,
          alt: episode.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: episode.title,
      description,
      images: [episode.thumbnailUrl || "/og-image.png"],
    },
  };
}

/**
 * Episode detail page
 * Displays full episode information including title, description, thumbnail,
 * publication date, duration, and topics
 */
export default async function EpisodePage({
  params,
  searchParams,
}: EpisodePageProps) {
  const { slug } = await params;
  const { t, tab } = await searchParams;
  const episode = await getEpisodeBySlugWithTranscript(slug);

  if (!episode) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnaocompila.com.br";
  const episodeUrl = `${baseUrl}/episodios/${episode.slug}`;

  // Parse and validate query params for deep linking
  const parsedTimestamp = t ? parseInt(t, 10) : undefined;
  const initialTimestamp = parsedTimestamp !== undefined && !Number.isNaN(parsedTimestamp) && parsedTimestamp >= 0
    ? parsedTimestamp
    : undefined;

  const validTabs = ["descricao", "capitulos", "transcricao"] as const;
  const initialTab = tab && validTabs.includes(tab as typeof validTabs[number])
    ? (tab as typeof validTabs[number])
    : undefined;

  // Fetch related episodes and chapters in parallel
  const [relatedEpisodes, chapters] = await Promise.all([
    getRelatedEpisodes(episode, 4),
    getChaptersByVideoId(episode.youtubeId),
  ]);

  return (
    <>
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
      <Container className="py-8 md:py-12">
        <EpisodeYouTubeWrapper
          episode={episode}
          episodeUrl={episodeUrl}
          relatedEpisodes={relatedEpisodes}
          chapters={chapters}
          initialTimestamp={initialTimestamp}
          initialTab={initialTab}
        />
      </Container>
    </>
  );
}
