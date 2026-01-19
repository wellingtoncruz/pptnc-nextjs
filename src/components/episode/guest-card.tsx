import { User, Twitter, Linkedin, Globe } from "lucide-react";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import type { Guest } from "@/types";

export interface GuestCardProps {
  /** Guest data to display */
  guest: Guest;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Validates that a URL is safe to use as an href (http/https only)
 */
function isValidUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Displays information about a podcast episode guest
 * Handles missing optional fields gracefully
 */
export function GuestCard({ guest, className }: GuestCardProps) {
  // Defensive: ensure guest object exists with at least a name
  if (!guest?.name) {
    return null;
  }

  const { name, role, company, bio, photoUrl, socialLinks } = guest;

  // Build subtitle from role and company
  const subtitle = [role, company].filter(Boolean).join(" @ ");

  // Validate social links URLs
  const hasValidTwitter = isValidUrl(socialLinks?.twitter);
  const hasValidLinkedin = isValidUrl(socialLinks?.linkedin);
  const hasValidWebsite = isValidUrl(socialLinks?.website);
  const hasAnySocialLinks = hasValidTwitter || hasValidLinkedin || hasValidWebsite;

  return (
    <div className={cn("flex gap-4", className)}>
      {/* Avatar */}
      <Avatar className="h-16 w-16 shrink-0">
        {photoUrl && <AvatarImage src={photoUrl} alt={name} />}
        <AvatarFallback>
          <User className="h-8 w-8" aria-hidden="true" />
        </AvatarFallback>
      </Avatar>

      {/* Info */}
      <div className="flex-1 space-y-1 min-w-0">
        <h3 className="font-semibold truncate">{name}</h3>
        {subtitle && (
          <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
        )}
        {bio && (
          <p className="text-sm text-muted-foreground line-clamp-2">{bio}</p>
        )}

        {/* Social Links - only render validated URLs */}
        {hasAnySocialLinks && (
          <div className="flex gap-2 pt-2">
            {hasValidTwitter && (
              <a
                href={socialLinks!.twitter}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${name} no Twitter`}
                className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Twitter className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
            {hasValidLinkedin && (
              <a
                href={socialLinks!.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${name} no LinkedIn`}
                className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Linkedin className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
            {hasValidWebsite && (
              <a
                href={socialLinks!.website}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Site de ${name}`}
                className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Globe className="h-4 w-4" aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
