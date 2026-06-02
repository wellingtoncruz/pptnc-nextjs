import { logger } from "@/lib/logger";

export type RealVisibility = "public" | "unlisted" | "private-or-deleted";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 5000;

interface YouTubeStatusItem {
  id: string;
  status?: { privacyStatus?: string };
}

interface YouTubeStatusResponse {
  items?: YouTubeStatusItem[];
}

/**
 * Resolves the live privacy status for the given YouTube video IDs.
 *
 * API key only sees `public`/`unlisted`. `private` (scheduled) and `deleted`
 * videos do NOT appear in the response — both are collapsed into
 * `'private-or-deleted'`. That's enough to decide whether to show on the web.
 */
export async function fetchYouTubeVisibility(
  ids: string[]
): Promise<Map<string, RealVisibility>> {
  const result = new Map<string, RealVisibility>();
  if (ids.length === 0) return result;

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY not configured");
  }

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const url = `${YOUTUBE_API_BASE}/videos?id=${batch.join(",")}&part=status&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`YouTube API ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as YouTubeStatusResponse;
    const seen = new Set<string>();
    for (const item of data.items ?? []) {
      const ps = item.status?.privacyStatus;
      if (ps === "public" || ps === "unlisted") {
        result.set(item.id, ps);
        seen.add(item.id);
      }
    }
    for (const id of batch) {
      if (!seen.has(id)) result.set(id, "private-or-deleted");
    }
  }

  return result;
}

/**
 * Convenience wrapper that swallows errors and logs them. Returns an empty
 * map on failure so callers can apply a conservative fallback (hide unknowns).
 */
export async function fetchYouTubeVisibilitySafe(
  ids: string[]
): Promise<Map<string, RealVisibility>> {
  try {
    return await fetchYouTubeVisibility(ids);
  } catch (error) {
    logger.warn("YouTube visibility fetch failed", {
      service: "youtube-visibility",
      candidates: ids.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}
