import Image from "next/image";
import Link from "next/link";
import { Youtube } from "lucide-react";

import { Container } from "@/components/layout/container";
import {
  SpotifyIcon,
  InstagramIcon,
  LinkedInIcon,
} from "@/components/icons/social-icons";
import { EXTERNAL_LINKS, NAV_LINKS, SITE_CONFIG } from "@/lib/constants";

/**
 * Social media links for the footer
 */
const socialLinks = [
  {
    href: EXTERNAL_LINKS.youtube,
    label: "YouTube",
    icon: Youtube,
  },
  {
    href: EXTERNAL_LINKS.spotify,
    label: "Spotify",
    icon: SpotifyIcon,
  },
  {
    href: EXTERNAL_LINKS.instagram,
    label: "Instagram",
    icon: InstagramIcon,
  },
  {
    href: EXTERNAL_LINKS.linkedin,
    label: "LinkedIn",
    icon: LinkedInIcon,
  },
];

/**
 * Footer component with branding, navigation, social links and copyright
 */
export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/50">
      <Container>
        <div className="py-8 md:py-12">
          {/* Brand Section */}
          <div className="mb-8 flex flex-col items-center text-center">
            <Image
              src="/pptnc_logo.png"
              alt={SITE_CONFIG.name}
              width={120}
              height={73}
              className="h-7 w-auto opacity-70"
            />
            <p className="mt-3 text-sm text-muted-foreground">
              {SITE_CONFIG.description}
            </p>
          </div>

          {/* Navigation and Social Links */}
          <div className="mb-8 flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-12">
            {/* Navigation Links */}
            <nav aria-label="Footer navigation">
              <ul className="flex items-center gap-6">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Social Links */}
            <div className="flex items-center gap-4">
              {socialLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                  aria-label={`Seguir no ${link.label}`}
                >
                  <link.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="mb-6 border-t border-border/50" />

          {/* Copyright */}
          <p className="text-center text-sm text-muted-foreground">
            © {currentYear} {SITE_CONFIG.name}. Todos os direitos reservados.
          </p>
        </div>
      </Container>
    </footer>
  );
}
