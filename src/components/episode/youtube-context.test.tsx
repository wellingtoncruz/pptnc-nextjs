import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";

import {
  YouTubeProvider,
  useYouTube,
  useYouTubeOptional,
} from "./youtube-context";

// Test component that uses the hooks
function TestConsumer() {
  const { isReady, seekTo, setPlayer } = useYouTube();
  return (
    <div>
      <span data-testid="is-ready">{isReady.toString()}</span>
      <button onClick={() => seekTo(100)}>Seek</button>
      <button
        onClick={() =>
          setPlayer({
            seekTo: vi.fn(),
            playVideo: vi.fn(),
          } as unknown as YT.Player)
        }
      >
        Set Player
      </button>
    </div>
  );
}

function OptionalTestConsumer() {
  const context = useYouTubeOptional();
  return (
    <div>
      <span data-testid="has-context">{(context !== null).toString()}</span>
    </div>
  );
}

describe("YouTubeProvider", () => {
  it("provides context to children", () => {
    render(
      <YouTubeProvider>
        <TestConsumer />
      </YouTubeProvider>
    );

    expect(screen.getByTestId("is-ready")).toHaveTextContent("false");
  });

  it("starts with isReady as false", () => {
    render(
      <YouTubeProvider>
        <TestConsumer />
      </YouTubeProvider>
    );

    expect(screen.getByTestId("is-ready")).toHaveTextContent("false");
  });

  it("sets isReady to true when player is set", () => {
    render(
      <YouTubeProvider>
        <TestConsumer />
      </YouTubeProvider>
    );

    const setPlayerButton = screen.getByText("Set Player");
    act(() => {
      setPlayerButton.click();
    });

    expect(screen.getByTestId("is-ready")).toHaveTextContent("true");
  });

  it("passes start time to registered callback when seeking before player ready", () => {
    const mockStartPlayback = vi.fn();

    function TestWithPendingSeek() {
      const { seekTo, registerStartPlayback, isReady } = useYouTube();
      registerStartPlayback(mockStartPlayback);
      return (
        <div>
          <span data-testid="is-ready">{isReady.toString()}</span>
          <button onClick={() => seekTo(150)}>Seek First</button>
        </div>
      );
    }

    render(
      <YouTubeProvider>
        <TestWithPendingSeek />
      </YouTubeProvider>
    );

    // Seek before player is ready
    const seekButton = screen.getByText("Seek First");
    act(() => {
      seekButton.click();
    });

    // Should have called startPlayback with the start time
    // YouTubeEmbed will use this to set playerVars.start
    expect(mockStartPlayback).toHaveBeenCalledWith(150);
  });

  it("calls seekTo and playVideo when player is ready", () => {
    const mockSeekTo = vi.fn();
    const mockPlayVideo = vi.fn();
    const mockPlayer = {
      seekTo: mockSeekTo,
      playVideo: mockPlayVideo,
    } as unknown as YT.Player;

    function TestWithSeek() {
      const { seekTo, setPlayer } = useYouTube();
      return (
        <div>
          <button onClick={() => setPlayer(mockPlayer)}>Set Player</button>
          <button onClick={() => seekTo(200)}>Seek</button>
        </div>
      );
    }

    render(
      <YouTubeProvider>
        <TestWithSeek />
      </YouTubeProvider>
    );

    // Set player first
    act(() => {
      screen.getByText("Set Player").click();
    });

    // Then seek
    act(() => {
      screen.getByText("Seek").click();
    });

    expect(mockSeekTo).toHaveBeenCalledWith(200, true);
    expect(mockPlayVideo).toHaveBeenCalled();
  });
});

describe("useYouTube", () => {
  it("throws error when used outside provider", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow("useYouTube must be used within YouTubeProvider");

    consoleSpy.mockRestore();
  });
});

describe("useYouTubeOptional", () => {
  it("returns null when used outside provider", () => {
    render(<OptionalTestConsumer />);

    expect(screen.getByTestId("has-context")).toHaveTextContent("false");
  });

  it("returns context when used inside provider", () => {
    render(
      <YouTubeProvider>
        <OptionalTestConsumer />
      </YouTubeProvider>
    );

    expect(screen.getByTestId("has-context")).toHaveTextContent("true");
  });
});

describe("registerStartPlayback", () => {
  it("calls registered callback with timestamp when seekTo is called without player", () => {
    const mockStartPlayback = vi.fn();

    function TestWithRegister() {
      const { seekTo, registerStartPlayback } = useYouTube();
      // Register the callback
      registerStartPlayback(mockStartPlayback);
      return (
        <div>
          <button onClick={() => seekTo(100)}>Seek Without Player</button>
        </div>
      );
    }

    render(
      <YouTubeProvider>
        <TestWithRegister />
      </YouTubeProvider>
    );

    // Seek without player being ready
    act(() => {
      screen.getByText("Seek Without Player").click();
    });

    // Should have called the registered callback with the timestamp
    expect(mockStartPlayback).toHaveBeenCalledWith(100);
  });

  it("does not call registered callback when player is already ready", () => {
    const mockStartPlayback = vi.fn();
    const mockSeekTo = vi.fn();
    const mockPlayVideo = vi.fn();
    const mockPlayer = {
      seekTo: mockSeekTo,
      playVideo: mockPlayVideo,
    } as unknown as YT.Player;

    function TestWithPlayer() {
      const { seekTo, setPlayer, registerStartPlayback } = useYouTube();
      registerStartPlayback(mockStartPlayback);
      return (
        <div>
          <button onClick={() => setPlayer(mockPlayer)}>Set Player</button>
          <button onClick={() => seekTo(100)}>Seek</button>
        </div>
      );
    }

    render(
      <YouTubeProvider>
        <TestWithPlayer />
      </YouTubeProvider>
    );

    // Set player first
    act(() => {
      screen.getByText("Set Player").click();
    });

    // Then seek
    act(() => {
      screen.getByText("Seek").click();
    });

    // Should NOT have called the start callback since player exists
    expect(mockStartPlayback).not.toHaveBeenCalled();
    // But should have called seekTo on the player
    expect(mockSeekTo).toHaveBeenCalledWith(100, true);
  });

  it("passes start time to startPlayback callback when player not ready", () => {
    const mockStartPlayback = vi.fn();

    function TestPendingWithStartPlayback() {
      const { seekTo, registerStartPlayback } = useYouTube();
      registerStartPlayback(mockStartPlayback);
      return (
        <div>
          <button onClick={() => seekTo(250)}>Seek First</button>
        </div>
      );
    }

    render(
      <YouTubeProvider>
        <TestPendingWithStartPlayback />
      </YouTubeProvider>
    );

    // Seek before player is ready
    act(() => {
      screen.getByText("Seek First").click();
    });

    // Should have called startPlayback with the timestamp
    // This allows YouTubeEmbed to create the player with playerVars.start
    expect(mockStartPlayback).toHaveBeenCalledWith(250);
  });
});
