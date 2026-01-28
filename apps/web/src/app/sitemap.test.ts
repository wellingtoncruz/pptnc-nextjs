import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/datastore/episodes", () => ({
  getEpisodes: vi.fn(),
}));

import sitemap from "./sitemap";
import { getEpisodes } from "@/lib/datastore/episodes";

describe("sitemap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates sitemap with static pages when no episodes", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([]);

    const result = await sitemap();

    expect(result).toHaveLength(5); // homepage, episodios, contato, sugerir-pauta, midiakit
    expect(result[0]).toEqual(
      expect.objectContaining({
        url: expect.stringMatching(/pptnaocompila\.com\.br$/),
        priority: 1.0,
        changeFrequency: "daily",
      })
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        url: expect.stringContaining("/episodios"),
        priority: 0.9,
        changeFrequency: "daily",
      })
    );
    expect(result[2]).toEqual(
      expect.objectContaining({
        url: expect.stringContaining("/contato"),
        priority: 0.5,
        changeFrequency: "monthly",
      })
    );
    expect(result[3]).toEqual(
      expect.objectContaining({
        url: expect.stringContaining("/sugerir-pauta"),
        priority: 0.5,
        changeFrequency: "monthly",
      })
    );
    expect(result[4]).toEqual(
      expect.objectContaining({
        url: expect.stringContaining("/midiakit"),
        priority: 0.6,
        changeFrequency: "monthly",
      })
    );
  });

  it("includes all episodes in sitemap", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([
      { slug: "ep-1", publishedAt: new Date("2026-01-10") },
      { slug: "ep-2", publishedAt: new Date("2026-01-11") },
    ] as any);

    const result = await sitemap();

    expect(result).toHaveLength(7); // 5 static + 2 episodes
    expect(result[5]).toEqual(
      expect.objectContaining({
        url: expect.stringContaining("/episodios/ep-1"),
        priority: 0.8,
        changeFrequency: "monthly",
      })
    );
    expect(result[6]).toEqual(
      expect.objectContaining({
        url: expect.stringContaining("/episodios/ep-2"),
        priority: 0.8,
        changeFrequency: "monthly",
      })
    );
  });

  it("sets appropriate priority values", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([
      { slug: "test-ep", publishedAt: new Date() },
    ] as any);

    const result = await sitemap();

    const homePage = result.find((item) => item.url?.endsWith("pptnaocompila.com.br"));
    const episodesPage = result.find(
      (item) => item.url?.endsWith("/episodios")
    );
    const episodePage = result.find((item) =>
      item.url?.includes("/episodios/test-ep")
    );

    expect(homePage?.priority).toBe(1.0);
    expect(episodesPage?.priority).toBe(0.9);
    expect(episodePage?.priority).toBe(0.8);
  });

  it("uses episode publishedAt as lastModified", async () => {
    const publishDate = new Date("2026-01-10T12:00:00Z");
    vi.mocked(getEpisodes).mockResolvedValue([
      { slug: "dated-ep", publishedAt: publishDate },
    ] as any);

    const result = await sitemap();

    const episodePage = result.find((item) =>
      item.url?.includes("/episodios/dated-ep")
    );
    expect(episodePage?.lastModified).toEqual(publishDate);
  });

  it("handles datastore errors gracefully", async () => {
    vi.mocked(getEpisodes).mockRejectedValue(new Error("Datastore unavailable"));

    const result = await sitemap();

    // Should still return static pages
    expect(result).toHaveLength(5);
    expect(result[0].url).toContain("pptnaocompila.com.br");
  });
});
