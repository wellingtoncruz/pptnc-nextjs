import Image from "next/image";
import { User, Twitter, Linkedin, Globe } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

  const { name, role, company, bio, photoUrl, photo, linkedin, socialLinks } = guest;

  // Build photo URL from photo filename or use photoUrl
  const guestPhotoUrl = photo ? `/guests/${photo}` : photoUrl;

  // Build subtitle from role and company
  const subtitle = [role, company].filter(Boolean).join(" @ ");

  // Validate social links URLs
  const hasValidTwitter = isValidUrl(socialLinks?.twitter);
  // Only show LinkedIn icon in social links if no direct linkedin (to avoid duplication)
  const hasValidLinkedinInSocialLinks = !linkedin && isValidUrl(socialLinks?.linkedin);
  const hasValidWebsite = isValidUrl(socialLinks?.website);
  const hasAnySocialLinks = hasValidTwitter || hasValidLinkedinInSocialLinks || hasValidWebsite;

  // LinkedIn URL (direct or from socialLinks)
  const linkedinUrl = linkedin || socialLinks?.linkedin;
  const hasLinkedIn = isValidUrl(linkedinUrl);

  // Avatar content
  const avatarContent = (
    <Avatar className="h-16 w-16 shrink-0">
      {guestPhotoUrl ? (
        <Image
          src={guestPhotoUrl}
          alt={name}
          width={64}
          height={64}
          className="h-full w-full object-cover"
        />
      ) : (
        <AvatarFallback>
          <User className="h-8 w-8" aria-hidden="true" />
        </AvatarFallback>
      )}
    </Avatar>
  );

  // Name content
  const nameContent = <h3 className="font-semibold truncate">{name}</h3>;

  return (
    <div className={cn("flex gap-4", className)}>
      {/* Avatar - linked if LinkedIn available */}
      {hasLinkedIn ? (
        <a
          href={linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Ver perfil de ${name} no LinkedIn`}
          className="shrink-0 transition-opacity hover:opacity-80"
        >
          {avatarContent}
        </a>
      ) : (
        avatarContent
      )}

      {/* Info */}
      <div className="flex-1 space-y-1 min-w-0">
        {hasLinkedIn ? (
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block transition-colors hover:text-primary"
          >
            {nameContent}
          </a>
        ) : (
          nameContent
        )}
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
            {hasValidLinkedinInSocialLinks && (
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
