"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

interface YouTubeContextValue {
  /** The YouTube player instance */
  player: YT.Player | null;
  /** Set the player instance when ready */
  setPlayer: (player: YT.Player) => void;
  /** Seek to a specific time and start playing */
  seekTo: (seconds: number) => void;
  /** Whether the player is ready */
  isReady: boolean;
  /**
   * Register a callback that starts video playback.
   * Called by YouTubeEmbed to register its handlePlay function.
   * When seekTo is called before the player exists, this callback
   * is invoked with the start time so the player can be created
   * with the correct initial position.
   */
  registerStartPlayback: (callback: (startTime?: number) => void) => void;
}

const YouTubeContext = createContext<YouTubeContextValue | null>(null);

interface YouTubeProviderProps {
  children: ReactNode;
}

/**
 * Provider for sharing YouTube player state across components
 * Allows timestamps in transcript to control video playback
 *
 * Autoplay Policy: Clicking on a timestamp is a user gesture, so browsers
 * allow autoplay with sound. The registerStartPlayback mechanism ensures
 * the video player is created when needed, even before user clicks the
 * video thumbnail directly.
 */
export function YouTubeProvider({ children }: YouTubeProviderProps) {
  const [player, setPlayerState] = useState<YT.Player | null>(null);
  const [isReady, setIsReady] = useState(false);
  const startPlaybackRef = useRef<((startTime?: number) => void) | null>(null);

  const setPlayer = useCallback((p: YT.Player) => {
    setPlayerState(p);
    setIsReady(true);
  }, []);

  const registerStartPlayback = useCallback((callback: (startTime?: number) => void) => {
    startPlaybackRef.current = callback;
  }, []);

  const seekTo = useCallback(
    (seconds: number) => {
      if (player && isReady) {
        player.seekTo(seconds, true);
        player.playVideo();
      } else {
        // Request video to start playing with the specified start time
        // YouTubeEmbed will create the player with this start position in playerVars
        startPlaybackRef.current?.(seconds);
      }
    },
    [player, isReady]
  );

  return (
    <YouTubeContext.Provider
      value={{ player, setPlayer, seekTo, isReady, registerStartPlayback }}
    >
      {children}
    </YouTubeContext.Provider>
  );
}

/**
 * Hook to access YouTube player controls
 * Must be used within YouTubeProvider
 */
export function useYouTube() {
  const context = useContext(YouTubeContext);
  if (!context) {
    throw new Error("useYouTube must be used within YouTubeProvider");
  }
  return context;
}

/**
 * Hook that returns YouTube context or null if not within provider
 * Useful for optional integration with YouTube player
 */
export function useYouTubeOptional() {
  return useContext(YouTubeContext);
}
