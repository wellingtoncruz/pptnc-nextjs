import Image from "next/image";
import Link from "next/link";
import { Youtube } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Container } from "@/components/layout/container";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ApplePodcastsIcon, SpotifyIcon } from "@/components/icons/social-icons";
import { EXTERNAL_LINKS, NAV_LINKS, SITE_CONFIG } from "@/lib/constants";

/**
 * Logo component with podcast branding
 */
function Logo() {
  return (
    <Link href="/" aria-label={SITE_CONFIG.name}>
      <Image
        src="/pptnc_logo.png"
        alt="PPTNC Logo"
        width={147}
        height={90}
        className="h-9 w-auto"
        priority
      />
    </Link>
  );
}

/**
 * Desktop navigation links - hidden on mobile
 */
function DesktopNav() {
  return (
    <nav className="hidden lg:flex lg:gap-6" aria-label="Navegação principal">
      {NAV_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * CTA buttons for desktop - Spotify (primary), Apple Podcasts and YouTube (secondary)
 */
function DesktopCTAs() {
  return (
    <div className="hidden lg:flex lg:items-center lg:gap-2">
      <Button size="sm" asChild>
        <a
          href={EXTERNAL_LINKS.spotify}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouça no Spotify"
        >
          <SpotifyIcon className="mr-2 h-4 w-4" />
          Spotify
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a
          href={EXTERNAL_LINKS.applePodcasts}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouça na Apple Podcasts"
        >
          <ApplePodcastsIcon className="mr-2 h-4 w-4" />
          Apple Podcasts
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a
          href={EXTERNAL_LINKS.youtube}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Assista no YouTube"
        >
          <Youtube className="mr-2 h-4 w-4" />
          YouTube
        </a>
      </Button>
    </div>
  );
}

/**
 * Mobile CTA - Spotify (primary) and Apple Podcasts; YouTube stays in the menu
 */
function MobileCTA() {
  return (
    <div className="flex items-center gap-2 lg:hidden">
      <Button size="sm" asChild>
        <a
          href={EXTERNAL_LINKS.spotify}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouça no Spotify"
        >
          <SpotifyIcon className="mr-2 h-4 w-4" />
          Spotify
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a
          href={EXTERNAL_LINKS.applePodcasts}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouça na Apple Podcasts"
        >
          <ApplePodcastsIcon className="h-4 w-4 sm:mr-2" />
          {/* Abaixo de 640px o nome empurra o logo para fora; só o ícone, e o aria-label mantém o nome */}
          <span className="max-sm:sr-only">Apple Podcasts</span>
        </a>
      </Button>
    </div>
  );
}

/**
 * Header component with responsive navigation
 *
 * Desktop (lg+): Full nav links, theme toggle, YouTube and Spotify CTAs
 * Mobile (<lg): Hamburger menu, logo, Spotify CTA only
 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container>
        <div className="flex h-16 items-center justify-between">
          {/* Left: Mobile menu + Logo */}
          <div className="flex items-center gap-2">
            <MobileNav />
            <Logo />
          </div>

          {/* Center: Desktop Navigation */}
          <DesktopNav />

          {/* Right: Theme toggle + CTAs */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <DesktopCTAs />
            <MobileCTA />
          </div>
        </div>
      </Container>
    </header>
  );
}
