"use client";

import { useState } from "react";

import { Youtube, Copy, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SpotifyIcon } from "@/components/icons/social-icons";
import { cn } from "@/lib/utils";
import { EXTERNAL_LINKS } from "@/lib/constants";

export interface SocialActionsProps {
  episodeUrl: string;
  className?: string;
}

export function SocialActions({ episodeUrl, className }: SocialActionsProps) {
  const [copied, setCopied] = useState(false);

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
