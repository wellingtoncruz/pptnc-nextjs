import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { TimestampLink } from "./timestamp-link";
import { YouTubeProvider, useYouTube } from "./youtube-context";
import * as analytics from "@/lib/analytics";

describe("TimestampLink", () => {
  it("renders formatted timestamp", () => {
    render(<TimestampLink seconds={65} />);

    expect(screen.getByRole("button")).toHaveTextContent("1:05");
  });

  it("renders zero timestamp correctly", () => {
    render(<TimestampLink seconds={0} />);

    expect(screen.getByRole("button")).toHaveTextContent("0:00");
  });

  it("renders large timestamp correctly", () => {
    render(<TimestampLink seconds={3661} />);

    expect(screen.getByRole("button")).toHaveTextContent("61:01");
  });

  it("has correct aria-label for accessibility", () => {
    render(<TimestampLink seconds={90} />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "Ir para 1:30 no vídeo");
  });

  it("applies custom className", () => {
    render(<TimestampLink seconds={0} className="custom-class" />);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("custom-class");
  });

  it("has correct styling classes", () => {
    render(<TimestampLink seconds={0} />);

    const button = screen.getByRole("button");
    expect(button).toHaveClass("font-mono");
    expect(button).toHaveClass("text-orange-500");
  });

  it("is clickable", () => {
    render(<TimestampLink seconds={60} />);

    const button = screen.getByRole("button");
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("type", "button");
  });

  it("calls seekTo when clicked within YouTubeProvider with player ready", () => {
    const mockSeekTo = vi.fn();
    const mockPlayVideo = vi.fn();
    const mockPlayer = {
      seekTo: mockSeekTo,
      playVideo: mockPlayVideo,
    } as unknown as YT.Player;

    // Test component that exposes setPlayer for testing
    function TestWithTimestamp() {
      const { setPlayer } = useYouTube();
      return (
        <div>
          <button onClick={() => setPlayer(mockPlayer)}>Init Player</button>
          <TimestampLink seconds={120} />
        </div>
      );
    }

    render(
      <YouTubeProvider>
        <TestWithTimestamp />
      </YouTubeProvider>
    );

    // First, initialize the player
    act(() => {
      screen.getByText("Init Player").click();
    });

    // Then click the timestamp
    const timestampButton = screen.getByRole("button", { name: /ir para/i });
    fireEvent.click(timestampButton);

    // Verify seekTo was called with correct seconds
    expect(mockSeekTo).toHaveBeenCalledWith(120, true);
    expect(mockPlayVideo).toHaveBeenCalled();
  });

  it("works without YouTubeProvider (graceful degradation)", () => {
    // Should not throw when rendered outside of provider
    render(<TimestampLink seconds={30} />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    // Click should work without errors even without provider
    expect(button).toBeInTheDocument();
  });

  describe("analytics tracking", () => {
    let trackTimestampClickSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      trackTimestampClickSpy = vi.spyOn(analytics, "trackTimestampClick");
    });

    afterEach(() => {
      trackTimestampClickSpy.mockRestore();
    });

    it("calls trackTimestampClick when episodeId is provided", () => {
      render(<TimestampLink seconds={120} episodeId="abc123" />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(trackTimestampClickSpy).toHaveBeenCalledWith(
        "abc123",
        120,
        "transcript"
      );
    });

    it("does not call trackTimestampClick when episodeId is not provided", () => {
      render(<TimestampLink seconds={120} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(trackTimestampClickSpy).not.toHaveBeenCalled();
    });

    it("passes source parameter to trackTimestampClick", () => {
      render(
        <TimestampLink seconds={60} episodeId="xyz789" source="related" />
      );

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(trackTimestampClickSpy).toHaveBeenCalledWith(
        "xyz789",
        60,
        "related"
      );
    });

    it("uses default source of transcript", () => {
      render(<TimestampLink seconds={90} episodeId="ep456" />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      expect(trackTimestampClickSpy).toHaveBeenCalledWith(
        "ep456",
        90,
        "transcript"
      );
    });

    it("tracks click before seeking video", () => {
      const mockSeekTo = vi.fn();
      const mockPlayVideo = vi.fn();
      const mockPlayer = {
        seekTo: mockSeekTo,
        playVideo: mockPlayVideo,
      } as unknown as YT.Player;

      function TestWithTracking() {
        const { setPlayer } = useYouTube();
        return (
          <div>
            <button onClick={() => setPlayer(mockPlayer)}>Init Player</button>
            <TimestampLink seconds={120} episodeId="track123" />
          </div>
        );
      }

      render(
        <YouTubeProvider>
          <TestWithTracking />
        </YouTubeProvider>
      );

      // Initialize player
      act(() => {
        screen.getByText("Init Player").click();
      });

      // Click timestamp
      const timestampButton = screen.getByRole("button", { name: /ir para/i });
      fireEvent.click(timestampButton);

      // Both tracking and seeking should be called
      expect(trackTimestampClickSpy).toHaveBeenCalledWith(
        "track123",
        120,
        "transcript"
      );
      expect(mockSeekTo).toHaveBeenCalledWith(120, true);
    });
  });
});
