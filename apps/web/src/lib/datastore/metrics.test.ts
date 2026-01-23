import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Firestore client
const mockGet = vi.fn();
const mockDoc = vi.fn(() => ({ get: mockGet }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));

vi.mock("./client", () => ({
  getFirestoreClient: vi.fn(() =>
    Promise.resolve({
      collection: mockCollection,
    })
  ),
  COLLECTION_METRICS: "metrics",
}));

// Mock unstable_cache to just call the function directly
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => fn,
}));

import { getMetrics, formatMetricNumber } from "./metrics";

describe("getMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns metrics from Firestore when document exists", async () => {
    const mockData = {
      episodes: 202,
      cortes: 150,
      reels: 75,
      youtubeSubscribers: 10000,
      spotifyFollowers: 5000,
      monthlyListeners: 15000,
      totalPlays: 600000,
      socialReach: 20000,
      updatedAt: { toDate: () => new Date("2026-01-15") },
    };

    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => mockData,
    });

    const metrics = await getMetrics();

    expect(metrics.episodes).toBe(202);
    expect(metrics.cortes).toBe(150);
    expect(metrics.reels).toBe(75);
    expect(metrics.youtubeSubscribers).toBe(10000);
    expect(metrics.spotifyFollowers).toBe(5000);
    expect(metrics.monthlyListeners).toBe(15000);
    expect(metrics.totalPlays).toBe(600000);
    expect(metrics.socialReach).toBe(20000);
    expect(mockCollection).toHaveBeenCalledWith("metrics");
    expect(mockDoc).toHaveBeenCalledWith("podcast");
  });

  it("returns default metrics when document does not exist", async () => {
    mockGet.mockResolvedValueOnce({
      exists: false,
      data: () => null,
    });

    const metrics = await getMetrics();

    expect(metrics.episodes).toBe(202);
    expect(metrics.cortes).toBe(0);
    expect(metrics.reels).toBe(0);
    expect(metrics.youtubeSubscribers).toBe(0);
    expect(metrics.spotifyFollowers).toBe(0);
  });

  it("returns default metrics when Firestore throws error", async () => {
    mockGet.mockRejectedValueOnce(new Error("Firestore unavailable"));

    const metrics = await getMetrics();

    expect(metrics.episodes).toBe(202);
    expect(metrics.youtubeSubscribers).toBe(0);
  });

  it("handles missing fields with defaults", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        episodes: 100,
        // Missing other fields
      }),
    });

    const metrics = await getMetrics();

    expect(metrics.episodes).toBe(100);
    expect(metrics.cortes).toBe(0); // Falls back to default
    expect(metrics.reels).toBe(0); // Falls back to default
    expect(metrics.youtubeSubscribers).toBe(0); // Falls back to default
    expect(metrics.spotifyFollowers).toBe(0); // Falls back to default
  });

  it("handles null data from document", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => null,
    });

    const metrics = await getMetrics();

    expect(metrics.episodes).toBe(202);
  });
});

describe("formatMetricNumber", () => {
  it("formats millions correctly", () => {
    expect(formatMetricNumber(1000000)).toBe("1M");
    expect(formatMetricNumber(1500000)).toBe("1.5M");
    expect(formatMetricNumber(2300000)).toBe("2.3M");
    expect(formatMetricNumber(10000000)).toBe("10M");
  });

  it("formats thousands correctly", () => {
    expect(formatMetricNumber(1000)).toBe("1K");
    expect(formatMetricNumber(1500)).toBe("1.5K");
    expect(formatMetricNumber(2300)).toBe("2.3K");
    expect(formatMetricNumber(10000)).toBe("10K");
    expect(formatMetricNumber(999000)).toBe("999K");
  });

  it("formats numbers under 1000 as-is", () => {
    expect(formatMetricNumber(0)).toBe("0");
    expect(formatMetricNumber(1)).toBe("1");
    expect(formatMetricNumber(100)).toBe("100");
    expect(formatMetricNumber(999)).toBe("999");
  });

  it("removes trailing .0 from formatted numbers", () => {
    expect(formatMetricNumber(1000)).toBe("1K");
    expect(formatMetricNumber(2000)).toBe("2K");
    expect(formatMetricNumber(1000000)).toBe("1M");
    expect(formatMetricNumber(5000000)).toBe("5M");
  });
});
