/* eslint-disable @next/next/no-img-element */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { YouTubeEmbed } from "./youtube-embed";

// Mock next/image - using native img element for testing
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    className?: string;
    sizes?: string;
    priority?: boolean;
  }) => <img src={src} alt={alt} {...props} />,
}));

describe("YouTubeEmbed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up any YouTube API global state
    // @ts-expect-error - cleaning up global state for tests
    delete window.YT;
    // @ts-expect-error - cleaning up global state for tests
    delete window.onYouTubeIframeAPIReady;
    // @ts-expect-error - cleaning up global state for tests
    delete window.__ytCallbackQueue;
  });

  afterEach(() => {
    // Clean up scripts added during tests
    const scripts = document.querySelectorAll(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    scripts.forEach((script) => script.remove());
    // Clean up callback queue
    // @ts-expect-error - cleaning up global state for tests
    delete window.__ytCallbackQueue;
  });

  describe("initial render (thumbnail state)", () => {
    it("renders thumbnail initially without iframe", () => {
      render(
        <YouTubeEmbed
          youtubeId="abc123"
          thumbnailUrl="https://example.com/thumb.jpg"
          title="Test Video"
        />
      );

      // Should show play button
      expect(screen.getByRole("button")).toBeInTheDocument();
      // Should show thumbnail image
      expect(screen.getByRole("img")).toHaveAttribute("alt", "Test Video");
      // Should NOT show iframe yet
      expect(screen.queryByTitle("Test Video")).not.toBeInTheDocument();
    });

    it("uses provided thumbnailUrl for image", () => {
      render(
        <YouTubeEmbed
          youtubeId="abc123"
          thumbnailUrl="https://example.com/custom-thumb.jpg"
          title="Test Video"
        />
      );

      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "https://example.com/custom-thumb.jpg");
    });

    it("uses YouTube default thumbnail when thumbnailUrl not provided", () => {
      render(<YouTubeEmbed youtubeId="abc123" title="Test Video" />);

      const img = screen.getByRole("img");
      expect(img).toHaveAttribute(
        "src",
        "https://img.youtube.com/vi/abc123/maxresdefault.jpg"
      );
    });

    it("has responsive aspect-video container", () => {
      const { container } = render(
        <YouTubeEmbed youtubeId="abc123" title="Test Video" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass("aspect-video");
    });
  });

  describe("play button interaction", () => {
    it("loads player after clicking play button", async () => {
      render(
        <YouTubeEmbed
          youtubeId="abc123"
          thumbnailUrl="https://example.com/thumb.jpg"
          title="Test Video"
        />
      );

      fireEvent.click(screen.getByRole("button"));

      // Play button should be gone after clicking
      await waitFor(() => {
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
      });

      // Thumbnail should be gone
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("supports keyboard activation with Enter key", async () => {
      render(<YouTubeEmbed youtubeId="abc123" title="Test Video" />);

      fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });

      // Should trigger play state
      await waitFor(() => {
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
      });
    });

    it("supports keyboard activation with Space key", async () => {
      render(<YouTubeEmbed youtubeId="abc123" title="Test Video" />);

      fireEvent.keyDown(screen.getByRole("button"), { key: " " });

      // Should trigger play state
      await waitFor(() => {
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
      });
    });

    it("does not trigger play on other keys", () => {
      render(<YouTubeEmbed youtubeId="abc123" title="Test Video" />);

      fireEvent.keyDown(screen.getByRole("button"), { key: "Tab" });

      // Should still show play button
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has accessible play button with aria-label", () => {
      render(<YouTubeEmbed youtubeId="abc123" title="Test Video" />);

      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-label",
        "Reproduzir Test Video"
      );
    });

    it("includes video title in aria-label", () => {
      render(
        <YouTubeEmbed youtubeId="abc123" title="My Amazing Episode Title" />
      );

      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-label",
        "Reproduzir My Amazing Episode Title"
      );
    });

    it("thumbnail image has alt text matching title", () => {
      render(
        <YouTubeEmbed youtubeId="abc123" title="Episode About Technology" />
      );

      expect(screen.getByRole("img")).toHaveAttribute(
        "alt",
        "Episode About Technology"
      );
    });
  });

  describe("edge cases", () => {
    it("shows fallback message when youtubeId is empty string", () => {
      render(<YouTubeEmbed youtubeId="" title="Test Video" />);

      expect(screen.getByText("Video nao disponivel")).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("applies custom className to container", () => {
      const { container } = render(
        <YouTubeEmbed
          youtubeId="abc123"
          title="Test Video"
          className="custom-class"
        />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass("custom-class");
    });

    it("maintains rounded-lg styling on container", () => {
      const { container } = render(
        <YouTubeEmbed youtubeId="abc123" title="Test Video" />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass("rounded-lg");
    });
  });

  describe("loading state", () => {
    it("shows loading indicator when player is loading", async () => {
      const { container } = render(
        <YouTubeEmbed youtubeId="abc123" title="Test Video" />
      );

      fireEvent.click(screen.getByRole("button"));

      // After clicking, the play button should be gone and loading state should be active
      await waitFor(() => {
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
      });

      // The component should show a loading spinner (has animate-spin class)
      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });
  });

  describe("YouTube API callbacks", () => {
    it("calls onPlayerReady when player is ready", async () => {
      const onPlayerReady = vi.fn();
      const mockPlayer = { playVideo: vi.fn(), destroy: vi.fn() };

      // Mock the YouTube API with a proper constructor
      const MockPlayer = function (
        this: typeof mockPlayer,
        _container: HTMLElement,
        config: { events: { onReady: (e: { target: typeof mockPlayer }) => void } }
      ) {
        setTimeout(() => {
          config.events.onReady({ target: mockPlayer });
        }, 0);
        Object.assign(this, mockPlayer);
      } as unknown as typeof YT.Player;

      window.YT = { Player: MockPlayer } as unknown as typeof YT;

      render(
        <YouTubeEmbed
          youtubeId="abc123"
          title="Test Video"
          onPlayerReady={onPlayerReady}
        />
      );

      fireEvent.click(screen.getByRole("button"));

      await waitFor(() => {
        expect(onPlayerReady).toHaveBeenCalledWith(mockPlayer);
      });
    });

    it("calls onStateChange when player state changes", async () => {
      const onStateChange = vi.fn();
      const mockPlayer = {
        playVideo: vi.fn(),
        destroy: vi.fn(),
        isMuted: vi.fn().mockReturnValue(false),
        unMute: vi.fn(),
      };

      // Mock the YouTube API with a proper constructor
      const MockPlayer = function (
        this: typeof mockPlayer,
        _container: HTMLElement,
        config: {
          events: {
            onReady: (e: { target: typeof mockPlayer }) => void;
            onStateChange: (e: { data: number; target: typeof mockPlayer }) => void;
          };
        }
      ) {
        setTimeout(() => {
          config.events.onReady({ target: mockPlayer });
          config.events.onStateChange({ data: 1, target: mockPlayer }); // 1 = playing
        }, 0);
        Object.assign(this, mockPlayer);
      } as unknown as typeof YT.Player;

      window.YT = { Player: MockPlayer } as unknown as typeof YT;

      render(
        <YouTubeEmbed
          youtubeId="abc123"
          title="Test Video"
          onStateChange={onStateChange}
        />
      );

      fireEvent.click(screen.getByRole("button"));

      await waitFor(() => {
        expect(onStateChange).toHaveBeenCalledWith(1);
      });
    });

    it("adds callback to queue when multiple embeds load simultaneously", async () => {
      render(
        <>
          <YouTubeEmbed youtubeId="video1" title="Video 1" />
          <YouTubeEmbed youtubeId="video2" title="Video 2" />
        </>
      );

      // Click both play buttons
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[0]);
      fireEvent.click(buttons[1]);

      // Both should be in the queue
      await waitFor(() => {
        expect(window.__ytCallbackQueue).toBeDefined();
        expect(window.__ytCallbackQueue?.length).toBe(2);
      });
    });
  });
});
