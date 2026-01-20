"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, buildChapterDeepLink } from "@/lib/utils";
import {
  parseSrt,
  groupSegmentsIntoParagraphsWithTimestamps,
} from "@/lib/transcript";
import { useMemo } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { TimestampLink } from "./timestamp-link";

import type { Chapter } from "@/types";

export interface ContentTabsProps {
  /** Episode description */
  description?: string;
  /** SRT formatted transcript content */
  transcriptSrt?: string;
  /** Chapters/segments for the episode */
  chapters?: Chapter[];
  /** Episode ID for analytics tracking */
  episodeId?: string;
  /** Full episode URL for building share links */
  episodeUrl?: string;
  /** Initial tab to show (from deep link) */
  initialTab?: "descricao" | "capitulos" | "transcricao";
  /** Timestamp to highlight (from deep link) */
  highlightedTimestamp?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ContentTabs component for organizing description and transcript in tabs
 * Both contents are rendered in the initial HTML for SEO (no lazy loading)
 * Timestamps in transcript are clickable and sync with video player
 */
export function ContentTabs({
  description,
  transcriptSrt,
  chapters = [],
  episodeId,
  episodeUrl,
  initialTab,
  highlightedTimestamp,
  className,
}: ContentTabsProps) {
  const handleShareChapter = async (seconds: number) => {
    if (!episodeUrl) {
      toast.error("Não foi possível gerar o link");
      return;
    }

    try {
      const deepLink = buildChapterDeepLink(episodeUrl, seconds);
      await navigator.clipboard.writeText(deepLink);
      toast.success("Link do capítulo copiado!");
    } catch (error) {
      console.error("Failed to copy chapter link:", error);
      toast.error("Erro ao copiar o link");
    }
  };
  const transcriptParagraphs = useMemo(() => {
    if (!transcriptSrt) return [];
    const segments = parseSrt(transcriptSrt);
    return groupSegmentsIntoParagraphsWithTimestamps(segments);
  }, [transcriptSrt]);

  const hasDescription = Boolean(description);
  const hasChapters = chapters.length > 0;
  const hasTranscript = transcriptParagraphs.length > 0;

  // Don't render if no content
  if (!hasDescription && !hasChapters && !hasTranscript) {
    return null;
  }

  // Determine default tab based on initialTab prop or available content
  const getDefaultTab = () => {
    // If initialTab is provided and valid, use it
    if (initialTab) {
      if (initialTab === "descricao" && hasDescription) return "descricao";
      if (initialTab === "capitulos" && hasChapters) return "capitulos";
      if (initialTab === "transcricao" && hasTranscript) return "transcricao";
    }
    // Fallback to first available tab
    return hasDescription ? "descricao" : hasChapters ? "capitulos" : "transcricao";
  };
  const defaultTab = getDefaultTab();

  return (
    <section
      className={cn("space-y-4", className)}
      aria-label="Conteúdo do episódio"
    >
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList>
          {hasDescription && (
            <TabsTrigger value="descricao">Descrição</TabsTrigger>
          )}
          {hasChapters && (
            <TabsTrigger value="capitulos">Capítulos</TabsTrigger>
          )}
          {hasTranscript && (
            <TabsTrigger value="transcricao">Transcrição</TabsTrigger>
          )}
        </TabsList>

        {/* Description Tab - forceMount keeps content in DOM for SEO */}
        {hasDescription && (
          <TabsContent
            value="descricao"
            className="mt-4 data-[state=inactive]:hidden"
            forceMount
          >
            <div className="rounded-md border p-4 md:max-h-[500px] md:overflow-y-auto">
              <p className="whitespace-pre-line text-lg leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          </TabsContent>
        )}

        {/* Chapters Tab - forceMount keeps content in DOM for SEO indexing */}
        {hasChapters && (
          <TabsContent
            value="capitulos"
            className="mt-4 data-[state=inactive]:hidden"
            forceMount
          >
            <div className="rounded-md border p-4 md:max-h-[500px] md:overflow-y-auto">
              <ul className="space-y-3">
                {chapters.map((chapter, idx) => {
                  const isHighlighted = highlightedTimestamp !== undefined &&
                    Math.floor(highlightedTimestamp) === Math.floor(chapter.startTime);
                  return (
                    <li
                      key={`${chapter.startTime}-${idx}`}
                      data-chapter-time={chapter.startTime}
                      className={cn(
                        "flex items-center gap-3 border-b pb-3 last:border-0 last:pb-0",
                        isHighlighted && "bg-orange-50 dark:bg-orange-950/20 rounded-md p-2 -m-2 ring-2 ring-orange-300 dark:ring-orange-700"
                      )}
                    >
                      <TimestampLink
                        seconds={chapter.startTime}
                        episodeId={episodeId}
                        source="chapters"
                      />
                      <span className="flex-1 text-lg text-muted-foreground">
                        {chapter.topic}
                      </span>
                      {episodeUrl && (
                        <button
                          type="button"
                          onClick={() => handleShareChapter(chapter.startTime)}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
                          aria-label={`Compartilhar capítulo: ${chapter.topic}`}
                        >
                          <Share2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </TabsContent>
        )}

        {/* Transcript Tab - forceMount keeps content in DOM for SEO indexing */}
        {hasTranscript && (
          <TabsContent
            value="transcricao"
            className="mt-4 data-[state=inactive]:hidden"
            forceMount
          >
            {/* Desktop: scroll with max-height, Mobile: natural flow */}
            <div className="rounded-md border p-4 md:max-h-[500px] md:overflow-y-auto">
              <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
                {transcriptParagraphs.map((paragraph) => (
                  <p key={paragraph.startTime}>
                    <TimestampLink
                      seconds={paragraph.startTime}
                      episodeId={episodeId}
                      source="transcript"
                      className="mr-2"
                    />
                    {paragraph.text}
                  </p>
                ))}
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
