import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/datastore/episodes", () => ({
  getEpisodes: vi.fn(),
}));

import { GET } from "./route";
import { getEpisodes } from "@/lib/datastore/episodes";

function makeEpisode(overrides: Record<string, unknown> = {}) {
  return {
    id: "abc123",
    slug: "episodio-teste",
    title: "Episódio Teste",
    description: "Descrição do episódio",
    publishedAt: new Date("2026-02-15T10:00:00Z"),
    duration: 3661,
    youtubeId: "abc123",
    thumbnails: {
      default: { url: "https://i.ytimg.com/vi/abc123/default.jpg", width: 120, height: 90 },
      medium: { url: "https://i.ytimg.com/vi/abc123/mqdefault.jpg", width: 320, height: 180 },
      high: { url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg", width: 480, height: 360 },
    },
    thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    guests: [],
    topics: ["ia"],
    statistics: { viewCount: "100", likeCount: "10", commentCount: "5", favoriteCount: "0" },
    contentDetails: { duration: "PT1H1M1S", caption: "false", dimension: "2d", definition: "hd", contentRating: {}, projection: "rectangular", licensedContent: false },
    channelId: "ch1",
    channelTitle: "PPTNC",
    playlistId: "pl1",
    position: 0,
    ...overrides,
  };
}

describe("RSS feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns valid RSS XML with correct content type", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([makeEpisode()] as any);

    const response = await GET();

    expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
    const body = await response.text();
    expect(body).toContain('<?xml version="1.0"');
    expect(body).toContain("<rss version=\"2.0\"");
    expect(body).toContain("xmlns:itunes=");
  });

  it("includes channel metadata", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([]);

    const response = await GET();
    const body = await response.text();

    expect(body).toContain("<title>PPT Não Compila</title>");
    expect(body).toContain("<language>pt-br</language>");
    expect(body).toContain("<itunes:category text=\"Technology\" />");
    expect(body).toContain("<atom:link href=");
  });

  it("includes episode items with correct fields", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([makeEpisode()] as any);

    const response = await GET();
    const body = await response.text();

    expect(body).toContain("<title>Episódio Teste</title>");
    expect(body).toContain("/episodios/episodio-teste</link>");
    expect(body).toContain("<guid isPermaLink=\"true\">");
    expect(body).toContain("<description>Descrição do episódio</description>");
    expect(body).toContain("<itunes:duration>01:01:01</itunes:duration>");
    expect(body).toContain("<itunes:image href=");
  });

  it("escapes special characters in title and description", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([
      makeEpisode({
        title: 'IA & Cloud: o "futuro" <agora>',
        description: "Tom's guide to <scripting> & more",
      }),
    ] as any);

    const response = await GET();
    const body = await response.text();

    expect(body).toContain("IA &amp; Cloud: o &quot;futuro&quot; &lt;agora&gt;");
    expect(body).toContain("Tom&#039;s guide to &lt;scripting&gt; &amp; more");
  });

  it("formats itunes:duration correctly", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([
      makeEpisode({ duration: 600 }),
    ] as any);

    const response = await GET();
    const body = await response.text();

    expect(body).toContain("<itunes:duration>00:10:00</itunes:duration>");
  });

  it("uses latest episode date as lastBuildDate", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([
      makeEpisode({ slug: "ep1", publishedAt: new Date("2026-03-01T12:00:00Z") }),
      makeEpisode({ slug: "ep2", publishedAt: new Date("2026-01-01T12:00:00Z") }),
    ] as any);

    const response = await GET();
    const body = await response.text();

    expect(body).toContain("<lastBuildDate>Sun, 01 Mar 2026 12:00:00 GMT</lastBuildDate>");
  });

  it("returns empty channel when no episodes", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([]);

    const response = await GET();
    const body = await response.text();

    expect(body).toContain("<channel>");
    expect(body).not.toContain("<item>");
  });

  it("handles datastore errors gracefully", async () => {
    vi.mocked(getEpisodes).mockRejectedValue(new Error("unavailable"));

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("<channel>");
    expect(body).not.toContain("<item>");
  });

  it("sets cache headers", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([]);

    const response = await GET();

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600, s-maxage=3600");
  });
});
