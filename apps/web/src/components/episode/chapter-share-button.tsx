"use client";

import { Share2, Copy, MessageCircle, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { buildChapterDeepLink } from "@/lib/utils";

interface ChapterShareButtonProps {
  /** Full episode URL for building share links */
  episodeUrl: string;
  /** Chapter start time in seconds */
  startTime: number;
  /** Chapter topic/title for share text */
  topic: string;
  /** Episode title for share text */
  episodeTitle?: string;
}

/**
 * Share button with dropdown menu for chapter sharing
 * Supports: Native share (mobile), Copy link, WhatsApp, X (Twitter)
 */
export function ChapterShareButton({
  episodeUrl,
  startTime,
  topic,
  episodeTitle,
}: ChapterShareButtonProps) {
  const deepLink = buildChapterDeepLink(episodeUrl, startTime);
  const shareText = episodeTitle
    ? `${topic} - ${episodeTitle} | PPT Nao Compila`
    : `${topic} | PPT Nao Compila`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(deepLink);
      toast.success("Link copiado!", {
        description: "Cole em qualquer lugar para compartilhar",
      });
    } catch {
      toast.error("Erro ao copiar o link");
    }
  };

  const handleNativeShare = async () => {
    if (!navigator.share) {
      handleCopyLink();
      return;
    }

    try {
      await navigator.share({
        title: shareText,
        text: `Confira esse trecho: ${topic}`,
        url: deepLink,
      });
    } catch (error) {
      // User cancelled or error - silently ignore cancel
      if ((error as Error).name !== "AbortError") {
        toast.error("Erro ao compartilhar");
      }
    }
  };

  const handleWhatsApp = () => {
    const whatsappText = encodeURIComponent(`${shareText}\n\n${deepLink}`);
    window.open(`https://wa.me/?text=${whatsappText}`, "_blank");
  };

  const handleTwitter = () => {
    const twitterText = encodeURIComponent(shareText);
    const twitterUrl = encodeURIComponent(deepLink);
    window.open(
      `https://twitter.com/intent/tweet?text=${twitterText}&url=${twitterUrl}`,
      "_blank"
    );
  };

  // Check if native share is available (usually mobile)
  const hasNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
          aria-label={`Compartilhar capítulo: ${topic}`}
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline text-xs">Compartilhar</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {hasNativeShare && (
          <>
            <DropdownMenuItem onClick={handleNativeShare} className="gap-2">
              <Share2 className="h-4 w-4" />
              <span>Compartilhar...</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleCopyLink} className="gap-2">
          <Copy className="h-4 w-4" />
          <span>Copiar link</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleWhatsApp} className="gap-2">
          <MessageCircle className="h-4 w-4" />
          <span>WhatsApp</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleTwitter} className="gap-2">
          <Link2 className="h-4 w-4" />
          <span>X (Twitter)</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
