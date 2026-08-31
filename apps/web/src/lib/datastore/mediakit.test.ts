import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
vi.mock("./client", () => ({
  getFirestoreClient: async () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({ doc: () => ({ get: mockGet }) }),
      }),
    }),
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { getMediakitRendered } from "./mediakit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMediakitRendered", () => {
  it("retorna as strings do PDF verbatim (nenhuma formatação própria)", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        values: {
          episodes: "240",
          cuts: "1.200",
          shorts: "1.920",
          youtubeSubscribers: "33.979",
          spotifyFollowers: "3.289",
          views: "2,38 mi",
          watchHours: "178k +",
          impressions: "+4,3 mi",
        },
        updatedAt: { toDate: () => new Date("2026-08-31T19:35:00Z") },
      }),
    });

    const rendered = await getMediakitRendered();
    expect(rendered.episodes).toBe("240");
    expect(rendered.views).toBe("2,38 mi");
    expect(rendered.watchHours).toBe("178k +");
    expect(rendered.impressions).toBe("+4,3 mi");
    expect(rendered.updatedAt).toEqual(new Date("2026-08-31T19:35:00Z"));
  });

  it("doc ausente (antes do 1º publish) → placeholders, nunca números inventados", async () => {
    mockGet.mockResolvedValue({ exists: false, data: () => undefined });
    const rendered = await getMediakitRendered();
    expect(rendered.episodes).toBe("—");
    expect(rendered.updatedAt).toBeNull();
  });

  it("falha do Firestore → placeholders (página nunca quebra)", async () => {
    mockGet.mockRejectedValue(new Error("boom"));
    const rendered = await getMediakitRendered();
    expect(rendered.views).toBe("—");
  });
});
