import Link from "next/link";
import { Youtube } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Container } from "@/components/layout/container";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SpotifyIcon } from "@/components/icons/social-icons";
import { EXTERNAL_LINKS, NAV_LINKS, SITE_CONFIG } from "@/lib/constants";

/**
 * Logo placeholder component
 * TODO: Replace with actual logo image when available
 */
function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label={SITE_CONFIG.name}>
      {/* Placeholder: Logo PPTNC - Microfone estilizado com as cores da marca (laranja #e85d04 sobre fundo escuro) */}
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 text-primary">
        <span className="text-xs font-bold">🎙️</span>
      </div>
      <span className="hidden font-bold sm:inline-block">{SITE_CONFIG.shortName}</span>
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
 * CTA buttons for desktop - YouTube (secondary) and Spotify (primary)
 */
function DesktopCTAs() {
  return (
    <div className="hidden lg:flex lg:items-center lg:gap-2">
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
    </div>
  );
}

/**
 * Mobile CTA - only Spotify (primary) to save space
 */
function MobileCTA() {
  return (
    <div className="lg:hidden">
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
