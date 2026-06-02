import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/cache before any imports that use it
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    _keyParts?: string[],
    _options?: { revalidate?: number; tags?: string[] }
  ) => fn,
}));

// Mock functions for Firestore query chain
const mockWhere = vi.fn().mockReturnThis();
const mockOrderBy = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();
const mockGet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

// Mock the @google-cloud/firestore module
vi.mock("@google-cloud/firestore", () => {
  class Firestore {
    collection() {
      return {
        where: (...args: unknown[]) => {
          mockWhere(...args);
          return this.collection();
        },
        orderBy: (...args: unknown[]) => {
          mockOrderBy(...args);
          return this.collection();
        },
        select: (...args: unknown[]) => {
          mockSelect(...args);
          return this.collection();
        },
        get: () => mockGet(),
      };
    }
    batch() {
      return {
        update: (...args: unknown[]) => mockBatchUpdate(...args),
        commit: () => mockBatchCommit(),
      };
    }
  }

  const FieldValue = {
    serverTimestamp: () => "__SERVER_TIMESTAMP__",
  };

  return { Firestore, FieldValue };
});

// Mock the YouTube visibility helper — tests control responses per case.
const mockVisibilitySafe = vi.fn();
vi.mock("@/lib/youtube/visibility", () => ({
  fetchYouTubeVisibilitySafe: (...args: unknown[]) => mockVisibilitySafe(...args),
}));

import { resetFirestoreClient } from "./client";
import {
  getEpisodes,
  getEpisodesCount,
  getEpisodeBySlug,
  getEpisodeByVideoId,
  getEpisodesByTopic,
  getEpisodesCountByTopic,
  getAllTopics,
  getLatestEpisode,
  clearTopicsCache,
  getRelatedEpisodes,
} from "./episodes";

// Sample mock document factory - matches Firestore document structure
// docId parameter sets the Firestore document ID (= YouTube video ID)
const createMockDocument = (overrides: Record<string, unknown> = {}, docId = "0dexQ7BDHME") => {
  const { ...dataOverrides } = overrides;

  const data = {
    title: "Agile Trends 2022 | PPT Não Compila ao vivo no evento",
    description: "O PPT Não Compila vai participar do maior evento...",
    publishedAt: "2022-04-06T13:12:55Z",
    duration: 4000,
    videoType: "episode",
    playlistId: "UUOvTsuQyJq-fpydse7BY2PQ",
    transcriptionTXT: "é [Música] [Aplausos] muito bem...",
    transcriptionSRT: "1\n00:00:00,300 --> 00:00:07,929\né\n...",
    thumbnails: {
      default: {
        url: "https://i.ytimg.com/vi/0dexQ7BDHME/default.jpg",
        width: 120,
        height: 90,
      },
      medium: {
        url: "https://i.ytimg.com/vi/0dexQ7BDHME/mqdefault.jpg",
        width: 320,
        height: 180,
      },
      high: {
        url: "https://i.ytimg.com/vi/0dexQ7BDHME/hqdefault.jpg",
        width: 480,
        height: 360,
      },
    },
    statistics: {
      commentCount: "1",
      favoriteCount: "0",
      viewCount: "153",
      likeCount: "4",
    },
    contentDetails: {
      caption: "false",
      dimension: "2d",
      duration: "PT1H26M25S",
      definition: "hd",
      contentRating: {},
      projection: "rectangular",
      licensedContent: false,
    },
    channelId: "UCOvTsuQyJq-fpydse7BY2PQ",
    channelTitle: "PPT Não Compila",
    position: 0,
    topics: ["javascript", "agile"],
    guests: [{ name: "John Doe", role: "Developer", company: "Acme" }],
    // Default to public so existing tests skip the YouTube reconciliation path.
    // Tests that exercise the reconciler override this explicitly.
    youtubePrivacyStatus: "public",
    ...dataOverrides,
  };

  return {
    id: docId,
    ref: { __docId: docId },
    data: () => data,
  };
};

// Create mock topic document
const createMockTopicDocument = (name: string) => ({
  id: name,
  data: () => ({ name, slug: name.toLowerCase() }),
});

describe("getEpisodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    // Default: no candidates (all docs are public in Firestore in the existing tests).
    // The reconciler tests below override this with explicit scenarios.
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("returns episodes sorted by publishedAt descending", async () => {
    const doc1 = createMockDocument({
      publishedAt: "2022-01-01T00:00:00Z",
    }, "video1");
    const doc2 = createMockDocument({
      publishedAt: "2022-02-01T00:00:00Z",
    }, "video2");

    mockGet.mockResolvedValue({
      docs: [doc2, doc1], // Firestore returns them ordered
      empty: false,
    });

    const episodes = await getEpisodes();

    expect(episodes).toHaveLength(2);
    expect(episodes[0].id).toBe("video2");
    expect(episodes[1].id).toBe("video1");
    expect(mockWhere).toHaveBeenCalledWith("videoType", "==", "episode");
    expect(mockOrderBy).toHaveBeenCalledWith("publishedAt", "desc");
  });

  it("returns empty array when no episodes exist", async () => {
    mockGet.mockResolvedValue({ docs: [], empty: true });

    const episodes = await getEpisodes();

    expect(episodes).toEqual([]);
  });

  it("maps document fields correctly", async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDocument()],
      empty: false,
    });

    const episodes = await getEpisodes();

    expect(episodes[0]).toMatchObject({
      id: "0dexQ7BDHME",
      title: "Agile Trends 2022 | PPT Não Compila ao vivo no evento",
      description: "O PPT Não Compila vai participar do maior evento...",
      duration: 4000,
      youtubeId: "0dexQ7BDHME",
      thumbnailUrl: "https://i.ytimg.com/vi/0dexQ7BDHME/hqdefault.jpg",
      topics: ["javascript", "agile"],
    });
  });

  it("generates slug from title when not present", async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDocument({ title: "Test Episode: Hello World!" })],
      empty: false,
    });

    const episodes = await getEpisodes();

    expect(episodes[0].slug).toBe("test-episode-hello-world");
  });

  it("applies limit option (in-memory slicing)", async () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      createMockDocument({}, `video${i}`)
    );
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes({ limit: 3 });

    expect(episodes).toHaveLength(3);
  });

  it("applies offset option (in-memory slicing)", async () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      createMockDocument({ title: `Episode ${i}` }, `video${i}`)
    );
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes({ offset: 5, limit: 3 });

    expect(episodes).toHaveLength(3);
    expect(episodes[0].title).toBe("Episode 5");
  });

  it("returns empty array when Firestore throws error", async () => {
    mockGet.mockRejectedValue(new Error("Connection failed"));

    const episodes = await getEpisodes();

    expect(episodes).toEqual([]);
  });
});

describe("getEpisodesCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    // Default: no candidates (all docs are public in Firestore in the existing tests).
    // The reconciler tests below override this with explicit scenarios.
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("returns count from cached episodes", async () => {
    const docs = Array.from({ length: 5 }, (_, i) =>
      createMockDocument({}, `video${i}`)
    );
    mockGet.mockResolvedValue({ docs, empty: false });

    const count = await getEpisodesCount();

    expect(count).toBe(5);
  });

  it("returns 0 when Firestore throws error", async () => {
    mockGet.mockRejectedValue(new Error("Connection failed"));

    const count = await getEpisodesCount();

    expect(count).toBe(0);
  });
});

describe("getEpisodeByVideoId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    // Default: no candidates (all docs are public in Firestore in the existing tests).
    // The reconciler tests below override this with explicit scenarios.
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("finds episode by doc ID (videoId)", async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDocument({}, "target-video")],
      empty: false,
    });

    const episode = await getEpisodeByVideoId("target-video");

    expect(episode).not.toBeNull();
    expect(episode?.youtubeId).toBe("target-video");
  });

  it("returns null when episode not found", async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDocument()],
      empty: false,
    });

    const episode = await getEpisodeByVideoId("nonexistent");

    expect(episode).toBeNull();
  });
});

describe("getEpisodeBySlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    // Default: no candidates (all docs are public in Firestore in the existing tests).
    // The reconciler tests below override this with explicit scenarios.
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("finds episode by generated slug", async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDocument({ title: "Hello World Episode" })],
      empty: false,
    });

    const episode = await getEpisodeBySlug("hello-world-episode");

    expect(episode).not.toBeNull();
    expect(episode?.slug).toBe("hello-world-episode");
  });

  it("returns null when slug not found", async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDocument()],
      empty: false,
    });

    const episode = await getEpisodeBySlug("nonexistent-slug");

    expect(episode).toBeNull();
  });
});

describe("getEpisodesByTopic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    // Default: no candidates (all docs are public in Firestore in the existing tests).
    // The reconciler tests below override this with explicit scenarios.
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("filters by topic in memory", async () => {
    const docs = [
      createMockDocument({ topics: ["javascript"] }, "js1"),
      createMockDocument({ topics: ["python"] }, "py1"),
      createMockDocument({ topics: ["javascript", "react"] }, "js2"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodesByTopic("javascript");

    expect(episodes).toHaveLength(2);
    expect(episodes.every((ep) => ep.topics.includes("javascript"))).toBe(true);
  });

  it("applies pagination options after filtering", async () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      createMockDocument({ topics: ["tech"] }, `video${i}`)
    );
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodesByTopic("tech", { limit: 3, offset: 2 });

    expect(episodes).toHaveLength(3);
    expect(episodes[0].id).toBe("video2");
  });
});

describe("getEpisodesCountByTopic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    // Default: no candidates (all docs are public in Firestore in the existing tests).
    // The reconciler tests below override this with explicit scenarios.
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("counts episodes with topic from cached data", async () => {
    const docs = [
      createMockDocument({ topics: ["javascript"] }),
      createMockDocument({ topics: ["python"] }),
      createMockDocument({ topics: ["javascript", "react"] }),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const count = await getEpisodesCountByTopic("javascript");

    expect(count).toBe(2);
  });

  it("returns 0 when no episodes match topic", async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDocument({ topics: ["python"] })],
      empty: false,
    });

    const count = await getEpisodesCountByTopic("nonexistent");

    expect(count).toBe(0);
  });
});

describe("getAllTopics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    // Default: no candidates (all docs are public in Firestore in the existing tests).
    // The reconciler tests below override this with explicit scenarios.
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("returns sorted topics from collection", async () => {
    mockGet.mockResolvedValue({
      docs: [
        createMockTopicDocument("React"),
        createMockTopicDocument("Angular"),
        createMockTopicDocument("Vue"),
      ],
      empty: false,
    });

    const topics = await getAllTopics();

    expect(topics).toEqual(["Angular", "React", "Vue"]);
  });

  it("falls back to document ID when name field is missing", async () => {
    mockGet.mockResolvedValue({
      docs: [{ id: "fallback-topic", data: () => ({}) }],
      empty: false,
    });

    const topics = await getAllTopics();

    expect(topics).toContain("fallback-topic");
  });
});

describe("getLatestEpisode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    // Default: no candidates (all docs are public in Firestore in the existing tests).
    // The reconciler tests below override this with explicit scenarios.
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("returns the first episode from cached data (already sorted)", async () => {
    const doc1 = createMockDocument({
      publishedAt: "2022-02-01T00:00:00Z",
    }, "latest");
    const doc2 = createMockDocument({
      publishedAt: "2022-01-01T00:00:00Z",
    }, "older");

    mockGet.mockResolvedValue({
      docs: [doc1, doc2], // Sorted by Firestore
      empty: false,
    });

    const episode = await getLatestEpisode();

    expect(episode).not.toBeNull();
    expect(episode?.id).toBe("latest");
  });

  it("returns null when no episodes exist", async () => {
    mockGet.mockResolvedValue({ docs: [], empty: true });

    const episode = await getLatestEpisode();

    expect(episode).toBeNull();
  });

  it("returns null when Firestore throws error", async () => {
    mockGet.mockRejectedValue(new Error("Connection failed"));

    const episode = await getLatestEpisode();

    expect(episode).toBeNull();
  });
});

describe("Date handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    // Default: no candidates (all docs are public in Firestore in the existing tests).
    // The reconciler tests below override this with explicit scenarios.
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("handles ISO string dates", async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDocument({ publishedAt: "2022-06-15T10:30:00Z" })],
      empty: false,
    });

    const episodes = await getEpisodes();

    expect(episodes[0].publishedAt).toBeInstanceOf(Date);
    expect(episodes[0].publishedAt.toISOString()).toBe("2022-06-15T10:30:00.000Z");
  });

  it("handles Firestore Timestamp objects", async () => {
    const timestamp = {
      toDate: () => new Date("2022-06-15T10:30:00Z"),
    };
    mockGet.mockResolvedValue({
      docs: [createMockDocument({ publishedAt: timestamp })],
      empty: false,
    });

    const episodes = await getEpisodes();

    expect(episodes[0].publishedAt).toBeInstanceOf(Date);
  });

  it("handles numeric timestamps", async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDocument({ publishedAt: 1655288400000 })],
      empty: false,
    });

    const episodes = await getEpisodes();

    expect(episodes[0].publishedAt).toBeInstanceOf(Date);
  });

  it("defaults to current date for missing publishedAt", async () => {
    const before = Date.now();
    mockGet.mockResolvedValue({
      docs: [createMockDocument({ publishedAt: undefined })],
      empty: false,
    });

    const episodes = await getEpisodes();
    const after = Date.now();

    expect(episodes[0].publishedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(episodes[0].publishedAt.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("Field mapping edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    // Default: no candidates (all docs are public in Firestore in the existing tests).
    // The reconciler tests below override this with explicit scenarios.
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("handles missing optional fields with defaults", async () => {
    mockGet.mockResolvedValue({
      docs: [
        createMockDocument({
          thumbnails: undefined,
          statistics: undefined,
          contentDetails: undefined,
          guests: undefined,
          topics: undefined,
        }),
      ],
      empty: false,
    });

    const episodes = await getEpisodes();

    expect(episodes[0].thumbnailUrl).toBe("https://i.ytimg.com/vi/0dexQ7BDHME/hqdefault.jpg");
    expect(episodes[0].statistics).toEqual({
      commentCount: "0",
      favoriteCount: "0",
      viewCount: "0",
      likeCount: "0",
    });
    expect(episodes[0].guests).toEqual([]);
    expect(episodes[0].topics).toEqual([]);
  });

  it("preserves future fields when present", async () => {
    mockGet.mockResolvedValue({
      docs: [
        createMockDocument({
          spotifyUrl: "https://spotify.com/episode/123",
          audioUrl: "https://audio.example.com/ep.mp3",
        }),
      ],
      empty: false,
    });

    const episodes = await getEpisodes();

    expect(episodes[0].spotifyUrl).toBe("https://spotify.com/episode/123");
    expect(episodes[0].audioUrl).toBe("https://audio.example.com/ep.mp3");
  });

  it("uses document ID as episode ID", async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDocument({ title: "Test" }, "my-doc-id")],
      empty: false,
    });

    const episodes = await getEpisodes();

    expect(episodes[0].id).toBe("my-doc-id");
  });
});

describe("getRelatedEpisodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    // Default: no candidates (all docs are public in Firestore in the existing tests).
    // The reconciler tests below override this with explicit scenarios.
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("returns episodes with shared topics sorted by number of shared topics", async () => {
    const docs = [
      createMockDocument({ topics: ["tech", "ai"], publishedAt: "2022-01-01T00:00:00Z" }, "current"),
      createMockDocument({ topics: ["tech", "cloud"], publishedAt: "2022-01-02T00:00:00Z" }, "ep1"),
      createMockDocument({ topics: ["tech", "ai"], publishedAt: "2022-01-03T00:00:00Z" }, "ep2"),
      createMockDocument({ topics: ["business"], publishedAt: "2022-01-04T00:00:00Z" }, "ep3"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();
    const currentEpisode = episodes.find((e) => e.id === "current")!;
    const related = await getRelatedEpisodes(currentEpisode, 2);

    expect(related).toHaveLength(2);
    // ep2 should be first (2 shared topics)
    expect(related[0].id).toBe("ep2");
    // ep1 should be second (1 shared topic)
    expect(related[1].id).toBe("ep1");
  });

  it("excludes current episode from results", async () => {
    const docs = [
      createMockDocument({ topics: ["tech"], publishedAt: "2022-01-01T00:00:00Z" }, "current"),
      createMockDocument({ topics: ["tech"], publishedAt: "2022-01-02T00:00:00Z" }, "other"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();
    const currentEpisode = episodes.find((e) => e.id === "current")!;
    const related = await getRelatedEpisodes(currentEpisode, 4);

    expect(related.every((ep) => ep.id !== "current")).toBe(true);
    expect(related).toHaveLength(1);
  });

  it("falls back to recent episodes when not enough related found", async () => {
    const docs = [
      createMockDocument({ topics: ["tech"], publishedAt: "2022-01-01T00:00:00Z" }, "current"),
      createMockDocument({ topics: ["tech"], publishedAt: "2022-01-02T00:00:00Z" }, "related"),
      createMockDocument({ topics: ["business"], publishedAt: "2022-01-04T00:00:00Z" }, "recent1"),
      createMockDocument({ topics: ["marketing"], publishedAt: "2022-01-03T00:00:00Z" }, "recent2"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();
    const currentEpisode = episodes.find((e) => e.id === "current")!;
    const related = await getRelatedEpisodes(currentEpisode, 3);

    expect(related).toHaveLength(3);
    // First should be the related episode
    expect(related[0].id).toBe("related");
    // Then fill with recent (sorted by date desc)
    expect(related[1].id).toBe("recent1");
    expect(related[2].id).toBe("recent2");
  });

  it("returns recent episodes when current episode has no topics", async () => {
    const docs = [
      createMockDocument({ topics: [], publishedAt: "2022-01-01T00:00:00Z" }, "current"),
      createMockDocument({ topics: ["tech"], publishedAt: "2022-01-04T00:00:00Z" }, "ep1"),
      createMockDocument({ topics: ["business"], publishedAt: "2022-01-03T00:00:00Z" }, "ep2"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();
    const currentEpisode = episodes.find((e) => e.id === "current")!;
    const related = await getRelatedEpisodes(currentEpisode, 2);

    expect(related).toHaveLength(2);
    // Returns recent episodes sorted by date (from cache order)
    expect(related[0].id).toBe("ep1");
    expect(related[1].id).toBe("ep2");
  });

  it("sorts by date when episodes have same number of shared topics", async () => {
    const docs = [
      createMockDocument({ topics: ["tech"], publishedAt: "2022-01-01T00:00:00Z" }, "current"),
      createMockDocument({ topics: ["tech"], publishedAt: "2022-01-02T00:00:00Z" }, "older"),
      createMockDocument({ topics: ["tech"], publishedAt: "2022-01-03T00:00:00Z" }, "newer"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();
    const currentEpisode = episodes.find((e) => e.id === "current")!;
    const related = await getRelatedEpisodes(currentEpisode, 2);

    expect(related).toHaveLength(2);
    // Newer episode should come first when same shared topics
    expect(related[0].id).toBe("newer");
    expect(related[1].id).toBe("older");
  });

  it("respects limit parameter", async () => {
    const docs = [
      createMockDocument({ topics: ["tech"], publishedAt: "2022-01-01T00:00:00Z" }, "current"),
      ...Array.from({ length: 10 }, (_, i) =>
        createMockDocument(
          { topics: ["tech"], publishedAt: `2022-01-${String(i + 2).padStart(2, "0")}T00:00:00Z` },
          `ep${i}`
        )
      ),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();
    const currentEpisode = episodes.find((e) => e.id === "current")!;
    const related = await getRelatedEpisodes(currentEpisode, 4);

    expect(related).toHaveLength(4);
  });

  it("returns empty array when only one episode exists", async () => {
    const docs = [
      createMockDocument({ topics: ["tech"], publishedAt: "2022-01-01T00:00:00Z" }, "only"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();
    const currentEpisode = episodes[0];
    const related = await getRelatedEpisodes(currentEpisode, 4);

    expect(related).toHaveLength(0);
  });

  it("returns recent episodes when current has topics but no matches found", async () => {
    const docs = [
      createMockDocument({ topics: ["unique-topic"], publishedAt: "2022-01-01T00:00:00Z" }, "current"),
      createMockDocument({ topics: ["different"], publishedAt: "2022-01-03T00:00:00Z" }, "other1"),
      createMockDocument({ topics: ["another"], publishedAt: "2022-01-02T00:00:00Z" }, "other2"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();
    const currentEpisode = episodes.find((e) => e.id === "current")!;
    const related = await getRelatedEpisodes(currentEpisode, 2);

    // Should fallback to recent episodes
    expect(related).toHaveLength(2);
    expect(related[0].id).toBe("other1"); // More recent
    expect(related[1].id).toBe("other2");
  });

  it("matches topics case-insensitively", async () => {
    const docs = [
      createMockDocument({ topics: ["Tech", "AI"], publishedAt: "2022-01-01T00:00:00Z" }, "current"),
      createMockDocument({ topics: ["tech", "ai"], publishedAt: "2022-01-02T00:00:00Z" }, "match"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();
    const currentEpisode = episodes.find((e) => e.id === "current")!;
    const related = await getRelatedEpisodes(currentEpisode, 2);

    expect(related).toHaveLength(1);
    expect(related[0].id).toBe("match");
  });
});

describe("getEpisodes — visibility reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
    mockVisibilitySafe.mockResolvedValue(new Map());
  });

  it("does NOT call YouTube when every Firestore doc is already public", async () => {
    const docs = [
      createMockDocument({}, "pub1"),
      createMockDocument({}, "pub2"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();

    expect(mockVisibilitySafe).not.toHaveBeenCalled();
    expect(episodes).toHaveLength(2);
  });

  it("hides private candidate even when YouTube confirms it is private-or-deleted", async () => {
    const docs = [
      createMockDocument({ youtubePrivacyStatus: "public" }, "pub"),
      createMockDocument({ youtubePrivacyStatus: "private" }, "scheduled"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });
    mockVisibilitySafe.mockResolvedValue(new Map([["scheduled", "private-or-deleted"]]));

    const episodes = await getEpisodes();

    expect(mockVisibilitySafe).toHaveBeenCalledWith(["scheduled"]);
    expect(episodes.map((e) => e.id)).toEqual(["pub"]);
  });

  it("promotes unlisted-in-Firestore doc that is now public on YouTube AND writes back", async () => {
    const docs = [
      createMockDocument({ youtubePrivacyStatus: "unlisted" }, "stale"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });
    mockVisibilitySafe.mockResolvedValue(new Map([["stale", "public"]]));

    const episodes = await getEpisodes();

    expect(episodes.map((e) => e.id)).toEqual(["stale"]);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      { __docId: "stale" },
      expect.objectContaining({
        youtubePrivacyStatus: "public",
        visibilityUpdatedAt: "__SERVER_TIMESTAMP__",
      })
    );
    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it("hides unlisted videos even when YouTube confirms unlisted", async () => {
    const docs = [
      createMockDocument({ youtubePrivacyStatus: "unlisted" }, "unl"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });
    mockVisibilitySafe.mockResolvedValue(new Map([["unl", "unlisted"]]));

    const episodes = await getEpisodes();

    expect(episodes).toHaveLength(0);
  });

  it("hides candidates conservatively when YouTube fetch fails (empty map)", async () => {
    const docs = [
      createMockDocument({ youtubePrivacyStatus: "public" }, "ok"),
      createMockDocument({ youtubePrivacyStatus: "private" }, "unknown"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });
    mockVisibilitySafe.mockResolvedValue(new Map()); // failure path returns empty

    const episodes = await getEpisodes();

    expect(episodes.map((e) => e.id)).toEqual(["ok"]);
  });

  it("treats docs without youtubePrivacyStatus as candidates", async () => {
    const docs = [
      createMockDocument({ youtubePrivacyStatus: undefined }, "legacy"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });
    mockVisibilitySafe.mockResolvedValue(new Map([["legacy", "public"]]));

    const episodes = await getEpisodes();

    expect(mockVisibilitySafe).toHaveBeenCalledWith(["legacy"]);
    expect(episodes.map((e) => e.id)).toEqual(["legacy"]);
  });

  it("does not call commit when no doc actually diverged from YouTube", async () => {
    const docs = [
      createMockDocument({ youtubePrivacyStatus: "private" }, "still-private"),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });
    mockVisibilitySafe.mockResolvedValue(new Map([["still-private", "private-or-deleted"]]));

    await getEpisodes();

    expect(mockBatchUpdate).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });
});
