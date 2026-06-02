import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fetchYouTubeVisibility, fetchYouTubeVisibilitySafe } from "./visibility";

const originalFetch = global.fetch;
const originalEnv = process.env.YOUTUBE_API_KEY;

function mockResponse(items: Array<{ id: string; status?: { privacyStatus: string } }>) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ items }),
  } as unknown as Response;
}

describe("fetchYouTubeVisibility", () => {
  beforeEach(() => {
    process.env.YOUTUBE_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns empty map for empty input without calling fetch", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await fetchYouTubeVisibility([]);

    expect(result.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps public, unlisted, and absent (private-or-deleted) correctly", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse([
        { id: "PUB", status: { privacyStatus: "public" } },
        { id: "UNL", status: { privacyStatus: "unlisted" } },
      ])
    ) as unknown as typeof fetch;

    const result = await fetchYouTubeVisibility(["PUB", "UNL", "PRIV"]);

    expect(result.get("PUB")).toBe("public");
    expect(result.get("UNL")).toBe("unlisted");
    expect(result.get("PRIV")).toBe("private-or-deleted");
  });

  it("batches more than 50 IDs into multiple calls", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `id${i}`);
    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      const idsInUrl = new URL(url).searchParams.get("id")!.split(",");
      return mockResponse(idsInUrl.map((id) => ({ id, status: { privacyStatus: "public" } })));
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await fetchYouTubeVisibility(ids);

    expect(fetchSpy).toHaveBeenCalledTimes(3); // 50 + 50 + 20
    expect(result.size).toBe(120);
    expect([...result.values()].every((v) => v === "public")).toBe(true);
  });

  it("includes the API key in the URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse([]));
    global.fetch = fetchSpy as unknown as typeof fetch;

    await fetchYouTubeVisibility(["X"]);

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("key=test-key");
    expect(url).toContain("part=status");
  });

  it("throws when YOUTUBE_API_KEY is missing", async () => {
    delete process.env.YOUTUBE_API_KEY;

    await expect(fetchYouTubeVisibility(["X"])).rejects.toThrow(/YOUTUBE_API_KEY/);
  });

  it("throws on non-OK HTTP response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    } as unknown as Response) as unknown as typeof fetch;

    await expect(fetchYouTubeVisibility(["X"])).rejects.toThrow(/403/);
  });

  it("propagates abort errors (timeout)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")) as unknown as typeof fetch;

    await expect(fetchYouTubeVisibility(["X"])).rejects.toThrow();
  });
});

describe("fetchYouTubeVisibilitySafe", () => {
  beforeEach(() => {
    process.env.YOUTUBE_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns empty map (not throws) when underlying call fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("boom")) as unknown as typeof fetch;

    const result = await fetchYouTubeVisibilitySafe(["X"]);

    expect(result.size).toBe(0);
  });

  it("passes through successful responses", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse([{ id: "X", status: { privacyStatus: "public" } }])
    ) as unknown as typeof fetch;

    const result = await fetchYouTubeVisibilitySafe(["X"]);

    expect(result.get("X")).toBe("public");
  });
});
