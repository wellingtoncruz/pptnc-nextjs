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
  }

  return { Firestore };
});

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
const createMockDocument = (overrides = {}) => {
  const data = {
    title: "Agile Trends 2022 | PPT Não Compila ao vivo no evento",
    description: "O PPT Não Compila vai participar do maior evento...",
    publishedAt: "2022-04-06T13:12:55Z",
    duration: 4000,
    isFullEpisode: true,
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
    resourceId: {
      kind: "youtube#video",
      videoId: "0dexQ7BDHME",
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
    ...overrides,
  };

  return {
    id: data.resourceId?.videoId || "doc-id",
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
  });

  it("returns episodes sorted by publishedAt descending", async () => {
    const doc1 = createMockDocument({
      publishedAt: "2022-01-01T00:00:00Z",
      resourceId: { videoId: "video1" },
    });
    const doc2 = createMockDocument({
      publishedAt: "2022-02-01T00:00:00Z",
      resourceId: { videoId: "video2" },
    });

    mockGet.mockResolvedValue({
      docs: [doc2, doc1], // Firestore returns them ordered
      empty: false,
    });

    const episodes = await getEpisodes();

    expect(episodes).toHaveLength(2);
    expect(episodes[0].id).toBe("video2");
    expect(episodes[1].id).toBe("video1");
    expect(mockWhere).toHaveBeenCalledWith("isFullEpisode", "==", true);
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
      createMockDocument({ resourceId: { videoId: `video${i}` } })
    );
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes({ limit: 3 });

    expect(episodes).toHaveLength(3);
  });

  it("applies offset option (in-memory slicing)", async () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      createMockDocument({
        resourceId: { videoId: `video${i}` },
        title: `Episode ${i}`,
      })
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
  });

  it("returns count from cached episodes", async () => {
    const docs = Array.from({ length: 5 }, (_, i) =>
      createMockDocument({ resourceId: { videoId: `video${i}` } })
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
  });

  it("finds episode by resourceId.videoId", async () => {
    mockGet.mockResolvedValue({
      docs: [createMockDocument({ resourceId: { videoId: "target-video" } })],
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
  });

  it("filters by topic in memory", async () => {
    const docs = [
      createMockDocument({
        resourceId: { videoId: "js1" },
        topics: ["javascript"],
      }),
      createMockDocument({
        resourceId: { videoId: "py1" },
        topics: ["python"],
      }),
      createMockDocument({
        resourceId: { videoId: "js2" },
        topics: ["javascript", "react"],
      }),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodesByTopic("javascript");

    expect(episodes).toHaveLength(2);
    expect(episodes.every((ep) => ep.topics.includes("javascript"))).toBe(true);
  });

  it("applies pagination options after filtering", async () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      createMockDocument({
        resourceId: { videoId: `video${i}` },
        topics: ["tech"],
      })
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
  });

  it("returns the first episode from cached data (already sorted)", async () => {
    const doc1 = createMockDocument({
      publishedAt: "2022-02-01T00:00:00Z",
      resourceId: { videoId: "latest" },
    });
    const doc2 = createMockDocument({
      publishedAt: "2022-01-01T00:00:00Z",
      resourceId: { videoId: "older" },
    });

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

    expect(episodes[0].thumbnailUrl).toBe("");
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

  it("uses document ID when resourceId.videoId is missing", async () => {
    mockGet.mockResolvedValue({
      docs: [
        {
          id: "doc-fallback-id",
          data: () => ({
            title: "Test",
            isFullEpisode: true,
          }),
        },
      ],
      empty: false,
    });

    const episodes = await getEpisodes();

    expect(episodes[0].id).toBe("doc-fallback-id");
  });
});

describe("getRelatedEpisodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFirestoreClient();
    clearTopicsCache();
  });

  it("returns episodes with shared topics sorted by number of shared topics", async () => {
    const docs = [
      createMockDocument({
        resourceId: { videoId: "current" },
        topics: ["tech", "ai"],
        publishedAt: "2022-01-01T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "ep1" },
        topics: ["tech", "cloud"], // 1 shared
        publishedAt: "2022-01-02T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "ep2" },
        topics: ["tech", "ai"], // 2 shared
        publishedAt: "2022-01-03T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "ep3" },
        topics: ["business"], // 0 shared
        publishedAt: "2022-01-04T00:00:00Z",
      }),
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
      createMockDocument({
        resourceId: { videoId: "current" },
        topics: ["tech"],
        publishedAt: "2022-01-01T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "other" },
        topics: ["tech"],
        publishedAt: "2022-01-02T00:00:00Z",
      }),
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
      createMockDocument({
        resourceId: { videoId: "current" },
        topics: ["tech"],
        publishedAt: "2022-01-01T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "related" },
        topics: ["tech"], // 1 shared
        publishedAt: "2022-01-02T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "recent1" },
        topics: ["business"], // 0 shared
        publishedAt: "2022-01-04T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "recent2" },
        topics: ["marketing"], // 0 shared
        publishedAt: "2022-01-03T00:00:00Z",
      }),
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
      createMockDocument({
        resourceId: { videoId: "current" },
        topics: [], // No topics
        publishedAt: "2022-01-01T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "ep1" },
        topics: ["tech"],
        publishedAt: "2022-01-04T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "ep2" },
        topics: ["business"],
        publishedAt: "2022-01-03T00:00:00Z",
      }),
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
      createMockDocument({
        resourceId: { videoId: "current" },
        topics: ["tech"],
        publishedAt: "2022-01-01T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "older" },
        topics: ["tech"], // 1 shared
        publishedAt: "2022-01-02T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "newer" },
        topics: ["tech"], // 1 shared
        publishedAt: "2022-01-03T00:00:00Z",
      }),
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
      createMockDocument({
        resourceId: { videoId: "current" },
        topics: ["tech"],
        publishedAt: "2022-01-01T00:00:00Z",
      }),
      ...Array.from({ length: 10 }, (_, i) =>
        createMockDocument({
          resourceId: { videoId: `ep${i}` },
          topics: ["tech"],
          publishedAt: `2022-01-${String(i + 2).padStart(2, "0")}T00:00:00Z`,
        })
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
      createMockDocument({
        resourceId: { videoId: "only" },
        topics: ["tech"],
        publishedAt: "2022-01-01T00:00:00Z",
      }),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();
    const currentEpisode = episodes[0];
    const related = await getRelatedEpisodes(currentEpisode, 4);

    expect(related).toHaveLength(0);
  });

  it("returns recent episodes when current has topics but no matches found", async () => {
    const docs = [
      createMockDocument({
        resourceId: { videoId: "current" },
        topics: ["unique-topic"], // No other episode has this
        publishedAt: "2022-01-01T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "other1" },
        topics: ["different"], // 0 shared
        publishedAt: "2022-01-03T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "other2" },
        topics: ["another"], // 0 shared
        publishedAt: "2022-01-02T00:00:00Z",
      }),
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
      createMockDocument({
        resourceId: { videoId: "current" },
        topics: ["Tech", "AI"], // Capitalized
        publishedAt: "2022-01-01T00:00:00Z",
      }),
      createMockDocument({
        resourceId: { videoId: "match" },
        topics: ["tech", "ai"], // Lowercase - should still match
        publishedAt: "2022-01-02T00:00:00Z",
      }),
    ];
    mockGet.mockResolvedValue({ docs, empty: false });

    const episodes = await getEpisodes();
    const currentEpisode = episodes.find((e) => e.id === "current")!;
    const related = await getRelatedEpisodes(currentEpisode, 2);

    expect(related).toHaveLength(1);
    expect(related[0].id).toBe("match");
  });
});
