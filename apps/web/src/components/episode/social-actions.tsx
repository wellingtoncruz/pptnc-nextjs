"use client";

import { useState } from "react";

import { Youtube, Copy, Check, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SpotifyIcon, XIcon, LinkedInIcon } from "@/components/icons/social-icons";
import { cn } from "@/lib/utils";
import { EXTERNAL_LINKS } from "@/lib/constants";

export interface SocialActionsProps {
  episodeUrl: string;
  episodeTitle?: string;
  className?: string;
}

export function SocialActions({
  episodeUrl,
  episodeTitle,
  className,
}: SocialActionsProps) {
  const [copied, setCopied] = useState(false);

  const shareText = episodeTitle
    ? `${episodeTitle} | PPT Nao Compila`
    : "Confira esse episódio do PPT Nao Compila";

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(episodeUrl);
      setCopied(true);
      toast.success("Link copiado!");
      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Erro ao copiar o link");
    }
  };

  const handleWhatsApp = () => {
    const whatsappText = encodeURIComponent(`${shareText}\n\n${episodeUrl}`);
    window.open(`https://wa.me/?text=${whatsappText}`, "_blank");
  };

  const handleTwitter = () => {
    const twitterText = encodeURIComponent(shareText);
    const twitterUrl = encodeURIComponent(episodeUrl);
    window.open(
      `https://twitter.com/intent/tweet?text=${twitterText}&url=${twitterUrl}`,
      "_blank"
    );
  };

  const handleLinkedIn = () => {
    const linkedInUrl = encodeURIComponent(episodeUrl);
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${linkedInUrl}`,
      "_blank"
    );
  };

  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {/* YouTube Link */}
      <Button variant="outline" size="sm" asChild>
        <a
          href={EXTERNAL_LINKS.youtube}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Seguir no YouTube (abre em nova aba)"
        >
          <Youtube className="mr-2 h-4 w-4" />
          Seguir no YouTube
        </a>
      </Button>

      {/* Spotify Link */}
      <Button variant="outline" size="sm" asChild>
        <a
          href={EXTERNAL_LINKS.spotify}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Seguir no Spotify (abre em nova aba)"
        >
          <SpotifyIcon className="mr-2 h-4 w-4" />
          Seguir no Spotify
        </a>
      </Button>

      {/* Share buttons */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleWhatsApp}
        aria-label="Compartilhar no WhatsApp (abre em nova aba)"
      >
        <MessageCircle className="mr-2 h-4 w-4" />
        WhatsApp
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleTwitter}
        aria-label="Compartilhar no X (abre em nova aba)"
      >
        <XIcon className="mr-2 h-4 w-4" />
        X
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={handleLinkedIn}
        aria-label="Compartilhar no LinkedIn (abre em nova aba)"
      >
        <LinkedInIcon className="mr-2 h-4 w-4" />
        LinkedIn
      </Button>

      {/* Copy Link Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyLink}
        aria-label="Copiar link do episódio"
      >
        {copied ? (
          <Check className="mr-2 h-4 w-4 text-green-500" />
        ) : (
          <Copy className="mr-2 h-4 w-4" />
        )}
        {copied ? "Copiado!" : "Copiar link"}
      </Button>
    </div>
  );
}
