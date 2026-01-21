"use client";

import { useEffect, useRef } from "react";
import { YouTubeProvider, useYouTube } from "./youtube-context";
import { EpisodeHeader } from "./episode-header";
import { ContentTabs } from "./content-tabs";
import { GuestSection } from "./guest-section";
import { SocialActions } from "./social-actions";
import { SubscriptionCta } from "./subscription-cta";
import { RelatedEpisodes } from "./related-episodes";

import type { Episode, Chapter } from "@/types";

interface EpisodeYouTubeWrapperProps {
  episode: Episode & { transcriptSrt?: string };
  episodeUrl: string;
  relatedEpisodes?: Episode[];
  chapters?: Chapter[];
  initialTimestamp?: number;
  initialTab?: "descricao" | "capitulos" | "transcricao";
}

/**
 * Inner component that has access to YouTube context
 * Renders episode content and connects video player to timestamp links
 */
function EpisodeContent({
  episode,
  episodeUrl,
  relatedEpisodes,
  chapters,
  initialTimestamp,
  initialTab,
}: EpisodeYouTubeWrapperProps) {
  const { setPlayer, registerStartPlayback, seekTo, isReady } = useYouTube();
  const hasAppliedInitialSeek = useRef(false);

  // Handle initial timestamp from deep link
  useEffect(() => {
    if (initialTimestamp !== undefined && isReady && !hasAppliedInitialSeek.current) {
      seekTo(initialTimestamp);
      hasAppliedInitialSeek.current = true;
    }
  }, [initialTimestamp, isReady, seekTo]);

  return (
    <article className="space-y-8">
      {/* 1. Video/Audio + Title + Metadata + Topics */}
      <EpisodeHeader
        episode={episode}
        onYouTubePlayerReady={setPlayer}
        registerStartPlayback={registerStartPlayback}
      />

      {/* 2. Convidados */}
      <GuestSection guests={episode.guests} />

      {/* 3. CTA - Social Actions */}
      <SocialActions episodeUrl={episodeUrl} episodeTitle={episode.title} />

      {/* 4. Descrição + Capítulos + Transcrição em Abas */}
      <ContentTabs
        description={episode.description}
        transcriptSrt={episode.transcriptSrt}
        chapters={chapters}
        episodeId={episode.youtubeId}
        episodeTitle={episode.title}
        episodeUrl={episodeUrl}
        initialTab={initialTab}
        highlightedTimestamp={initialTimestamp}
      />

      {/* 5. Episódios Relacionados */}
      {relatedEpisodes && relatedEpisodes.length > 0 && (
        <RelatedEpisodes episodes={relatedEpisodes} />
      )}

      {/* 6. CTA de Conversão - Final call-to-action */}
      <SubscriptionCta />
    </article>
  );
}

/**
 * Wrapper component that provides YouTube context for timestamp synchronization
 * Connects the YouTube player to clickable timestamps in the transcript
 */
export function EpisodeYouTubeWrapper({
  episode,
  episodeUrl,
  relatedEpisodes,
  chapters,
  initialTimestamp,
  initialTab,
}: EpisodeYouTubeWrapperProps) {
  return (
    <YouTubeProvider>
      <EpisodeContent
        episode={episode}
        episodeUrl={episodeUrl}
        relatedEpisodes={relatedEpisodes}
        chapters={chapters}
        initialTimestamp={initialTimestamp}
        initialTab={initialTab}
      />
    </YouTubeProvider>
  );
}
