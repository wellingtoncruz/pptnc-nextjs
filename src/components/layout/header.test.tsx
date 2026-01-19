import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { Header } from "./header";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: vi.fn(),
    resolvedTheme: "light",
  }),
}));

// Mock MobileNav since it uses Sheet which requires DOM setup
vi.mock("./mobile-nav", () => ({
  MobileNav: () => <button data-testid="mobile-nav-mock">Menu</button>,
}));

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the header element", () => {
    render(<Header />);
    const header = screen.getByRole("banner");
    expect(header).toBeInTheDocument();
  });

  it("renders logo with link to home", () => {
    render(<Header />);
    const logoLink = screen.getByRole("link", { name: /ppt não compila/i });
    expect(logoLink).toHaveAttribute("href", "/");
  });

  it("renders desktop navigation links", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /episódios/i })).toBeInTheDocument();
  });

  it("renders navigation with aria-label", () => {
    render(<Header />);
    const nav = screen.getByRole("navigation", { name: /navegação principal/i });
    expect(nav).toBeInTheDocument();
  });

  it("renders theme toggle button", () => {
    render(<Header />);
    const toggleButton = screen.getByRole("button", { name: /alternar tema/i });
    expect(toggleButton).toBeInTheDocument();
  });

  it("renders Spotify CTA link", () => {
    render(<Header />);
    // Multiple Spotify links (mobile and desktop)
    const spotifyLinks = screen.getAllByRole("link", { name: /spotify/i });
    expect(spotifyLinks.length).toBeGreaterThan(0);
    expect(spotifyLinks[0]).toHaveAttribute(
      "href",
      expect.stringContaining("spotify.com")
    );
  });

  it("renders YouTube CTA link on desktop", () => {
    render(<Header />);
    const youtubeLink = screen.getByRole("link", { name: /youtube/i });
    expect(youtubeLink).toHaveAttribute(
      "href",
      expect.stringContaining("youtube.com")
    );
  });

  it("has sticky positioning", () => {
    render(<Header />);
    const header = screen.getByRole("banner");
    expect(header).toHaveClass("sticky", "top-0");
  });

  it("renders mobile nav trigger", () => {
    render(<Header />);
    const mobileNav = screen.getByTestId("mobile-nav-mock");
    expect(mobileNav).toBeInTheDocument();
  });

  it("external links open in new tab", () => {
    render(<Header />);
    const spotifyLinks = screen.getAllByRole("link", { name: /spotify/i });
    expect(spotifyLinks[0]).toHaveAttribute("target", "_blank");
    expect(spotifyLinks[0]).toHaveAttribute("rel", "noopener noreferrer");
  });
});
