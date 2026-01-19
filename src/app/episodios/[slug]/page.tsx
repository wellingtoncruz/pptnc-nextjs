import { notFound } from "next/navigation";

import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { EpisodeHeader, GuestSection, SocialActions, SubscriptionCta } from "@/components/episode";
import { EpisodeJsonLd } from "@/components/seo";
import { getEpisodeBySlug, getEpisodes } from "@/lib/datastore/episodes";

interface EpisodePageProps {
  params: Promise<{
    slug: string;
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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnc.com.br";
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
}: EpisodePageProps) {
  const { slug } = await params;
  const episode = await getEpisodeBySlug(slug);

  if (!episode) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pptnc.com.br";
  const episodeUrl = `${baseUrl}/episodios/${episode.slug}`;

  return (
    <>
      <EpisodeJsonLd episode={episode} baseUrl={baseUrl} />
      <Container className="py-8 md:py-12">
        <article className="space-y-8">
          {/* 1. Video/Audio + Title + Metadata + Topics */}
          <EpisodeHeader episode={episode} />

          {/* 2. Convidados */}
          <GuestSection guests={episode.guests} />

          {/* 3. CTA - Social Actions */}
          <SocialActions episodeUrl={episodeUrl} />

          {/* 4. Descrição */}
          {episode.description && (
            <section className="space-y-4" aria-labelledby="episode-description-heading">
              <h2 id="episode-description-heading" className="text-xl font-semibold">
                Sobre o episódio
              </h2>
              <p className="whitespace-pre-line text-lg leading-relaxed text-muted-foreground">
                {episode.description}
              </p>
            </section>
          )}

          {/* 5. CTA de Conversão - Final call-to-action */}
          <SubscriptionCta />
        </article>
      </Container>
    </>
  );
}
