import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSpotifyUrl } from "./resolve-url";

describe("resolveSpotifyUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined for undefined input", async () => {
    expect(await resolveSpotifyUrl(undefined)).toBeUndefined();
  });

  it("returns full Spotify URLs unchanged", async () => {
    const url = "https://open.spotify.com/episode/abc123";
    expect(await resolveSpotifyUrl(url)).toBe(url);
  });

  it("returns non-Spotify URLs unchanged", async () => {
    const url = "https://example.com/something";
    expect(await resolveSpotifyUrl(url)).toBe(url);
  });

  it("resolves spti.fi short URLs via redirect", async () => {
    const shortUrl = "https://spti.fi/abc123";
    const fullUrl = "https://open.spotify.com/episode/xyz789";

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      url: fullUrl,
    } as Response);

    const result = await resolveSpotifyUrl(shortUrl);

    expect(result).toBe(fullUrl);
    expect(fetch).toHaveBeenCalledWith(shortUrl, {
      method: "HEAD",
      redirect: "follow",
    });
  });

  it("resolves spotify.link short URLs via redirect", async () => {
    const shortUrl = "https://spotify.link/abc123";
    const fullUrl = "https://open.spotify.com/show/xyz789";

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      url: fullUrl,
    } as Response);

    const result = await resolveSpotifyUrl(shortUrl);
    expect(result).toBe(fullUrl);
  });

  it("returns original URL when redirect does not lead to open.spotify.com", async () => {
    const shortUrl = "https://spti.fi/abc123";

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      url: "https://some-other-site.com/page",
    } as Response);

    const result = await resolveSpotifyUrl(shortUrl);
    expect(result).toBe(shortUrl);
  });

  it("returns original URL when fetch fails", async () => {
    const shortUrl = "https://spti.fi/abc123";

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await resolveSpotifyUrl(shortUrl);
    expect(result).toBe(shortUrl);
  });

  it("returns invalid URL strings unchanged", async () => {
    expect(await resolveSpotifyUrl("not-a-url")).toBe("not-a-url");
  });
});
