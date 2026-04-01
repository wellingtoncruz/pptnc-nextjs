import { logger } from "@/lib/logger";

const SPOTIFY_SHORT_HOSTS = ["spti.fi", "spotify.link"];

/**
 * Resolves Spotify shortened URLs (spti.fi, spotify.link) to their
 * canonical open.spotify.com form by following the redirect server-side.
 * Returns the original URL unchanged if it's already a full Spotify URL
 * or if resolution fails.
 */
export async function resolveSpotifyUrl(
  url: string | undefined
): Promise<string | undefined> {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    if (!SPOTIFY_SHORT_HOSTS.includes(parsed.hostname)) {
      return url;
    }
  } catch {
    return url;
  }

  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    const resolved = response.url;

    if (resolved && resolved.includes("open.spotify.com")) {
      return resolved;
    }

    logger.warn("Spotify short URL did not resolve to open.spotify.com", {
      service: "spotify",
      original: url,
      resolved,
    });
    return url;
  } catch (error) {
    logger.warn("Failed to resolve Spotify short URL", {
      service: "spotify",
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return url;
  }
}
