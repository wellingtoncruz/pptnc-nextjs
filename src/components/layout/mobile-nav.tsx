"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Youtube } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { SpotifyIcon } from "@/components/icons/social-icons";
import { EXTERNAL_LINKS, NAV_LINKS, SITE_CONFIG } from "@/lib/constants";

/**
 * Mobile navigation component using shadcn/ui Sheet
 * Visible only on mobile (< lg breakpoint)
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Abrir menu de navegação"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-left">
            {/* Placeholder: Logo PPTNC - Microfone estilizado */}
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 text-primary">
              <span className="text-xs font-bold">🎙️</span>
            </div>
            {SITE_CONFIG.shortName}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Menu de navegação do podcast PPT Não Compila
          </SheetDescription>
        </SheetHeader>

        {/* Navigation Links */}
        <nav className="mt-6 flex flex-col gap-2" aria-label="Menu de navegação">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Platform Links */}
        <div className="mt-6 flex flex-col gap-2">
          <span className="px-3 text-xs font-medium uppercase text-muted-foreground">
            Plataformas
          </span>
          <a
            href={EXTERNAL_LINKS.youtube}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => setOpen(false)}
          >
            <Youtube className="h-4 w-4" />
            YouTube
          </a>
          <a
            href={EXTERNAL_LINKS.spotify}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => setOpen(false)}
          >
            <SpotifyIcon className="h-4 w-4" />
            Spotify
          </a>
        </div>

        {/* Theme Toggle at bottom */}
        <div className="mt-auto border-t pt-4">
          <div className="flex items-center justify-between px-3">
            <span className="text-sm text-muted-foreground">Tema</span>
            <ThemeToggle />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
