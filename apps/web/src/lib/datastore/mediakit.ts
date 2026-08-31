import { getFirestoreClient } from "./client";
import { logger } from "@/lib/logger";

/**
 * Rendered mediakit display values — the EXACT formatted strings shown by the
 * published mediakit PDF, persisted by the mediakit-generator job right after
 * each successful publish (doc `podcasts/pptnc/mediakit/rendered`).
 *
 * The /midiakit page displays these verbatim so the page and the PDF can
 * never diverge (equalização por construção — Epic 30, 2026-08-31). This
 * REPLACES the legacy hand-maintained `metrics/podcast` doc for that page.
 */
export interface MediakitRendered {
  episodes: string;
  cuts: string;
  shorts: string;
  youtubeSubscribers: string;
  spotifyFollowers: string;
  views: string;
  watchHours: string;
  impressions: string;
  updatedAt: Date | null;
}

/** Placeholder shown until the generator publishes for the first time. */
const PLACEHOLDER = "—";

const EMPTY: MediakitRendered = {
  episodes: PLACEHOLDER,
  cuts: PLACEHOLDER,
  shorts: PLACEHOLDER,
  youtubeSubscribers: PLACEHOLDER,
  spotifyFollowers: PLACEHOLDER,
  views: PLACEHOLDER,
  watchHours: PLACEHOLDER,
  impressions: PLACEHOLDER,
  updatedAt: null,
};

async function fetchMediakitRendered(): Promise<MediakitRendered> {
  try {
    const db = await getFirestoreClient();
    const doc = await db
      .collection("podcasts")
      .doc("pptnc")
      .collection("mediakit")
      .doc("rendered")
      .get();

    const values = doc.data()?.values as Record<string, string> | undefined;
    if (!doc.exists || !values) {
      logger.warn("Mediakit rendered doc missing — showing placeholders", {
        service: "mediakit",
      });
      return EMPTY;
    }

    return {
      episodes: values.episodes ?? PLACEHOLDER,
      cuts: values.cuts ?? PLACEHOLDER,
      shorts: values.shorts ?? PLACEHOLDER,
      youtubeSubscribers: values.youtubeSubscribers ?? PLACEHOLDER,
      spotifyFollowers: values.spotifyFollowers ?? PLACEHOLDER,
      views: values.views ?? PLACEHOLDER,
      watchHours: values.watchHours ?? PLACEHOLDER,
      impressions: values.impressions ?? PLACEHOLDER,
      updatedAt: doc.data()?.updatedAt?.toDate?.() ?? null,
    };
  } catch (error) {
    logger.error("Failed to fetch mediakit rendered values", {
      service: "mediakit",
      error: error instanceof Error ? error.message : String(error),
    });
    return EMPTY;
  }
}

// Sem unstable_cache de propósito: no build o cache seria primado com EMPTY
// (sem credenciais) e embarcado na imagem; a página é force-dynamic e o custo
// real é 1 leitura de doc por pageview.
export const getMediakitRendered = fetchMediakitRendered;
