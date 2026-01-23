"use client";

import { useMemo } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { parseSrt, groupSegmentsIntoParagraphs } from "@/lib/transcript";

export interface EpisodeTranscriptProps {
  /** SRT formatted transcript content */
  transcriptSrt?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Displays the episode transcript with proper formatting and scrollable container
 * Parses SRT format and groups text into readable paragraphs
 */
export function EpisodeTranscript({
  transcriptSrt,
  className,
}: EpisodeTranscriptProps) {
  const paragraphs = useMemo(() => {
    if (!transcriptSrt) return [];
    const segments = parseSrt(transcriptSrt);
    return groupSegmentsIntoParagraphs(segments);
  }, [transcriptSrt]);

  // Don't render anything if no transcript
  if (!transcriptSrt || paragraphs.length === 0) {
    return null;
  }

  return (
    <section
      className={cn("space-y-4", className)}
      aria-labelledby="transcript-heading"
      role="region"
    >
      <h2 id="transcript-heading" className="text-xl font-semibold">
        Transcrição
      </h2>

      {/* Scrollable container for desktop - full height on mobile */}
      <ScrollArea className="h-auto max-h-none rounded-md border p-4 md:max-h-[600px]">
        <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}
