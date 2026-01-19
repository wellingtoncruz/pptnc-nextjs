import { Youtube } from "lucide-react";

import { Container } from "@/components/layout/container";
import {
  SpotifyIcon,
  InstagramIcon,
  LinkedInIcon,
} from "@/components/icons/social-icons";
import { EXTERNAL_LINKS, SITE_CONFIG } from "@/lib/constants";

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
 * Footer component with social links and copyright
 */
export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background">
      <Container>
        <div className="flex flex-col items-center gap-6 py-8 sm:flex-row sm:justify-between">
          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            © {currentYear} {SITE_CONFIG.name}. Todos os direitos reservados.
          </p>

          {/* Social Links */}
          <div className="flex items-center gap-4">
            {socialLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Seguir no ${link.label}`}
              >
                <link.icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
