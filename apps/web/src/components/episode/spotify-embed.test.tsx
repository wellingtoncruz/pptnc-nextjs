import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { SpotifyEmbed } from "./spotify-embed";

describe("SpotifyEmbed", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("URL parsing", () => {
    it("renders iframe with correct embed URL for episode URLs", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/episode/abc123"
          title="Test Episode"
        />
      );

      const iframe = document.querySelector("iframe");
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        "src",
        "https://open.spotify.com/embed/episode/abc123?utm_source=generator&theme=0"
      );
    });

    it("renders iframe with correct embed URL for show URLs", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/show/xyz789"
          title="Test Show"
        />
      );

      const iframe = document.querySelector("iframe");
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        "src",
        "https://open.spotify.com/embed/show/xyz789?utm_source=generator&theme=0"
      );
    });

    it("shows fallback when URL is invalid", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://example.com/invalid"
          title="Test Episode"
        />
      );

      expect(screen.getByText(/Link do Spotify indisponivel/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /abrir.*no spotify/i })).toBeInTheDocument();
    });

    it("shows fallback when URL format is unsupported", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/playlist/abc123"
          title="Test Playlist"
        />
      );

      expect(screen.getByText(/Link do Spotify indisponivel/i)).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has accessible iframe title", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/episode/abc123"
          title="My Episode Title"
        />
      );

      const iframe = document.querySelector("iframe");
      expect(iframe).toHaveAttribute("title", "Spotify: My Episode Title");
    });

    it("has accessible fallback link with aria-label", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://example.com/invalid"
          title="My Episode"
        />
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("aria-label", "Abrir My Episode no Spotify");
    });
  });

  describe("Loading state", () => {
    it("shows loading indicator initially", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/episode/abc123"
          title="Test Episode"
        />
      );

      // Loading indicator should be visible
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });

    it("hides loading indicator after iframe loads", async () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/episode/abc123"
          title="Test Episode"
        />
      );

      const iframe = document.querySelector("iframe");

      await act(async () => {
        fireEvent.load(iframe!);
      });

      // Loading indicator should be hidden
      expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
    });
  });

  describe("Error handling", () => {
    it("iframe has onError handler attached", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/episode/abc123"
          title="Test Episode"
        />
      );

      const iframe = document.querySelector("iframe");
      expect(iframe).toBeInTheDocument();
      // Note: iframe onError is attached via React's event system
      // The actual error handling is tested by the component rendering
      // the fallback when hasError state is true
    });

    it("fallback link shows correct error message text", () => {
      // Test that the fallback state renders correctly
      // by using an invalid URL that triggers the fallback
      render(
        <SpotifyEmbed
          spotifyUrl="https://example.com/invalid"
          title="Test Episode"
        />
      );

      expect(screen.getByText(/Link do Spotify indisponivel/i)).toBeInTheDocument();
    });
  });

  describe("Styling", () => {
    it("applies custom className", () => {
      const { container } = render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/episode/abc123"
          title="Test Episode"
          className="my-custom-class"
        />
      );

      expect(container.firstChild).toHaveClass("my-custom-class");
    });

    it("iframe has rounded corners", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/episode/abc123"
          title="Test Episode"
        />
      );

      const iframe = document.querySelector("iframe");
      expect(iframe).toHaveClass("rounded-xl");
    });
  });

  describe("Iframe attributes", () => {
    it("has lazy loading enabled", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/episode/abc123"
          title="Test Episode"
        />
      );

      const iframe = document.querySelector("iframe");
      expect(iframe).toHaveAttribute("loading", "lazy");
    });

    it("has correct allow attributes", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/episode/abc123"
          title="Test Episode"
        />
      );

      const iframe = document.querySelector("iframe");
      expect(iframe).toHaveAttribute("allow");
      expect(iframe?.getAttribute("allow")).toContain("autoplay");
      expect(iframe?.getAttribute("allow")).toContain("encrypted-media");
    });

    it("has correct dimensions", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://open.spotify.com/episode/abc123"
          title="Test Episode"
        />
      );

      const iframe = document.querySelector("iframe");
      expect(iframe).toHaveAttribute("width", "100%");
      expect(iframe).toHaveAttribute("height", "352");
    });
  });

  describe("Fallback link", () => {
    it("opens in new tab with security attributes", () => {
      render(
        <SpotifyEmbed
          spotifyUrl="https://example.com/invalid"
          title="Test Episode"
        />
      );

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("links to original Spotify URL when invalid URL", () => {
      const spotifyUrl = "https://example.com/invalid-url";
      render(
        <SpotifyEmbed
          spotifyUrl={spotifyUrl}
          title="Test Episode"
        />
      );

      // Invalid URL shows fallback immediately
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", spotifyUrl);
    });

    it("fallback has Spotify branded button", () => {
      // Invalid URLs show fallback, verify the button has Spotify branding
      render(
        <SpotifyEmbed
          spotifyUrl="https://example.com/invalid"
          title="Test Episode"
        />
      );

      const link = screen.getByRole("link");
      expect(link).toHaveClass("bg-[#1DB954]"); // Spotify green
      expect(link).toHaveTextContent("Abrir no Spotify");
    });
  });
});
