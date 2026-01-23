import { Youtube } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SpotifyIcon } from "@/components/icons/social-icons";
import { cn } from "@/lib/utils";
import { EXTERNAL_LINKS, SITE_CONFIG } from "@/lib/constants";

export interface SubscriptionCtaProps {
  className?: string;
}

/**
 * Subscription CTA component with compelling messaging
 * Positioned at the end of episode pages as a final call-to-action
 */
export function SubscriptionCta({ className }: SubscriptionCtaProps) {
  return (
    <Card
      className={cn("bg-primary/5 border-primary/20 shadow-lg", className)}
      role="complementary"
      aria-label="Inscreva-se no podcast"
    >
      <CardHeader>
        <CardTitle className="text-xl">
          Não perca os próximos episódios!
        </CardTitle>
        <CardDescription className="text-base">
          Inscreva-se para receber novidades do {SITE_CONFIG.name}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a
              href={EXTERNAL_LINKS.youtubeSubscribe}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Inscrever no YouTube (abre em nova aba)"
            >
              <Youtube className="mr-2 h-4 w-4" />
              Inscrever no YouTube
            </a>
          </Button>
          <Button variant="outline" asChild>
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
        </div>
      </CardContent>
    </Card>
  );
}
