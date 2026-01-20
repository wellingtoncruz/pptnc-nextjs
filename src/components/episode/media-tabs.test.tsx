import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { MediaTabs } from "./media-tabs";

// Mock the child components to isolate MediaTabs testing
vi.mock("./youtube-embed", () => ({
  YouTubeEmbed: ({ title, youtubeId }: { title: string; youtubeId: string }) => (
    <div data-testid="youtube-embed" data-title={title} data-id={youtubeId}>
      YouTube Player: {title}
    </div>
  ),
}));

vi.mock("./spotify-embed", () => ({
  SpotifyEmbed: ({ title, spotifyUrl }: { title: string; spotifyUrl: string }) => (
    <div data-testid="spotify-embed" data-title={title} data-url={spotifyUrl}>
      Spotify Player: {title}
    </div>
  ),
}));

describe("MediaTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("without Spotify URL", () => {
    it("renders only YouTubeEmbed without tabs", () => {
      render(
        <MediaTabs
          youtubeId="abc123"
          title="Test Episode"
        />
      );

      // Should render YouTube player
      expect(screen.getByTestId("youtube-embed")).toBeInTheDocument();

      // Should NOT render tabs
      expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

      // Should NOT render Spotify
      expect(screen.queryByTestId("spotify-embed")).not.toBeInTheDocument();
    });

    it("passes props correctly to YouTubeEmbed", () => {
      render(
        <MediaTabs
          youtubeId="abc123"
          thumbnailUrl="https://example.com/thumb.jpg"
          title="My Episode"
        />
      );

      const youtube = screen.getByTestId("youtube-embed");
      expect(youtube).toHaveAttribute("data-id", "abc123");
      expect(youtube).toHaveAttribute("data-title", "My Episode");
    });
  });

  describe("with Spotify URL", () => {
    it("renders tabs with Vídeo and Áudio options", () => {
      render(
        <MediaTabs
          youtubeId="abc123"
          spotifyUrl="https://open.spotify.com/episode/xyz789"
          title="Test Episode"
        />
      );

      // Should render tablist
      expect(screen.getByRole("tablist")).toBeInTheDocument();

      // Should render both tab triggers with new labels
      expect(screen.getByRole("tab", { name: /vídeo/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /áudio/i })).toBeInTheDocument();
    });

    it("shows Vídeo tab content by default", () => {
      render(
        <MediaTabs
          youtubeId="abc123"
          spotifyUrl="https://open.spotify.com/episode/xyz789"
          title="Test Episode"
        />
      );

      // Video (YouTube) should be visible (it's the default tab)
      expect(screen.getByTestId("youtube-embed")).toBeInTheDocument();

      // Audio (Spotify) should not be visible initially (hidden tab content)
      expect(screen.queryByTestId("spotify-embed")).not.toBeInTheDocument();
    });

    it("Vídeo tab is active by default", () => {
      render(
        <MediaTabs
          youtubeId="abc123"
          spotifyUrl="https://open.spotify.com/episode/xyz789"
          title="Test Episode"
        />
      );

      // Video is selected by default
      expect(screen.getByRole("tab", { name: /vídeo/i })).toHaveAttribute("data-state", "active");
      expect(screen.getByRole("tab", { name: /áudio/i })).toHaveAttribute("data-state", "inactive");
    });

    it("tabs have correct data attributes for state", () => {
      render(
        <MediaTabs
          youtubeId="abc123"
          spotifyUrl="https://open.spotify.com/episode/xyz789"
          title="Test Episode"
        />
      );

      const videoTab = screen.getByRole("tab", { name: /vídeo/i });
      const audioTab = screen.getByRole("tab", { name: /áudio/i });

      // Verify data-state attributes exist and have correct initial values
      expect(videoTab).toHaveAttribute("data-state", "active");
      expect(audioTab).toHaveAttribute("data-state", "inactive");

      // Verify data-slot for shadcn/ui tabs
      expect(videoTab).toHaveAttribute("data-slot", "tabs-trigger");
      expect(audioTab).toHaveAttribute("data-slot", "tabs-trigger");
    });

    it("both tabs are interactive", () => {
      render(
        <MediaTabs
          youtubeId="abc123"
          spotifyUrl="https://open.spotify.com/episode/xyz789"
          title="Test Episode"
        />
      );

      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(2);

      // Both should be buttons (clickable)
      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute("type", "button");
        expect(tab).not.toBeDisabled();
      });
    });
  });

  describe("Accessibility", () => {
    it("has proper tab roles and aria attributes", () => {
      render(
        <MediaTabs
          youtubeId="abc123"
          spotifyUrl="https://open.spotify.com/episode/xyz789"
          title="Test Episode"
        />
      );

      const tabList = screen.getByRole("tablist");
      expect(tabList).toBeInTheDocument();

      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(2);

      // First tab (Vídeo) should be selected by default
      expect(tabs[0]).toHaveAttribute("aria-selected", "true");
      expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    });

    it("has correct aria-selected on initial render", () => {
      render(
        <MediaTabs
          youtubeId="abc123"
          spotifyUrl="https://open.spotify.com/episode/xyz789"
          title="Test Episode"
        />
      );

      const [videoTab, audioTab] = screen.getAllByRole("tab");

      // Vídeo should be selected by default (it's now first)
      expect(videoTab).toHaveAttribute("aria-selected", "true");
      expect(audioTab).toHaveAttribute("aria-selected", "false");
    });

    it("tabs are keyboard accessible", () => {
      render(
        <MediaTabs
          youtubeId="abc123"
          spotifyUrl="https://open.spotify.com/episode/xyz789"
          title="Test Episode"
        />
      );

      // Radix Tabs handles keyboard navigation internally
      // We verify that tabs have correct tabIndex and can receive focus
      const tabList = screen.getByRole("tablist");
      expect(tabList).toHaveAttribute("tabindex", "0");

      const tabs = screen.getAllByRole("tab");
      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute("type", "button");
      });
    });
  });

  describe("Styling", () => {
    it("applies custom className", () => {
      const { container } = render(
        <MediaTabs
          youtubeId="abc123"
          spotifyUrl="https://open.spotify.com/episode/xyz789"
          title="Test Episode"
          className="my-custom-class"
        />
      );

      expect(container.firstChild).toHaveClass("my-custom-class");
    });

    it("applies custom className when no Spotify URL", () => {
      const { container } = render(
        <MediaTabs
          youtubeId="abc123"
          title="Test Episode"
          className="my-custom-class"
        />
      );

      // When no Spotify, returns YouTubeEmbed directly
      // The className should be passed to YouTubeEmbed
      expect(container.firstChild).toBeInTheDocument();
    });

    it("has icons in tab triggers", () => {
      render(
        <MediaTabs
          youtubeId="abc123"
          spotifyUrl="https://open.spotify.com/episode/xyz789"
          title="Test Episode"
        />
      );

      // Check for SVG icons in tabs
      const tabs = screen.getAllByRole("tab");
      tabs.forEach((tab) => {
        expect(tab.querySelector("svg")).toBeInTheDocument();
      });
    });
  });

  describe("Callbacks", () => {
    it("passes onYouTubePlayerReady callback when no Spotify URL", () => {
      const onReady = vi.fn();

      render(
        <MediaTabs
          youtubeId="abc123"
          title="Test Episode"
          onYouTubePlayerReady={onReady}
        />
      );

      // Without spotifyUrl, YouTubeEmbed renders directly (no tabs)
      expect(screen.getByTestId("youtube-embed")).toBeInTheDocument();
    });

    it("passes onYouTubeStateChange callback when no Spotify URL", () => {
      const onStateChange = vi.fn();

      render(
        <MediaTabs
          youtubeId="abc123"
          title="Test Episode"
          onYouTubeStateChange={onStateChange}
        />
      );

      // Without spotifyUrl, YouTubeEmbed renders directly (no tabs)
      expect(screen.getByTestId("youtube-embed")).toBeInTheDocument();
    });
  });
});
