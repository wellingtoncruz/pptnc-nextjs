import { describe, it, expect, vi, beforeEach } from "vitest";

import { getChaptersByVideoId } from "./chunks";

// Mock the Firestore client
vi.mock("./client", () => ({
  getFirestoreClient: vi.fn(),
  COLLECTION_EPISODES: "podcasts/pptnc/videos",
}));

// Mock the transcript module
vi.mock("@/lib/transcript", () => ({
  parseSrtTimestamp: vi.fn((srt: string) => {
    const match = srt.match(/(\d+):(\d+):(\d+),(\d+)/);
    if (!match) return 0;
    return (
      parseInt(match[1]) * 3600 +
      parseInt(match[2]) * 60 +
      parseInt(match[3]) +
      parseInt(match[4]) / 1000
    );
  }),
}));

import { getFirestoreClient } from "./client";

/**
 * Helper to create a mock Firestore chain that supports:
 *   db.collection(x).doc(id).get()           → docSnapshot
 *   db.collection(x).doc(id).collection(y)… → chunksSnapshot
 */
function createMockDb(options: {
  docData?: Record<string, unknown> | null;
  chunksSnapshot?: { empty: boolean; docs: unknown[] };
}) {
  const { docData = null, chunksSnapshot = { empty: true, docs: [] } } = options;

  const docSnapshot = {
    exists: docData !== null,
    data: () => docData,
  };

  const mockDocRef = {
    get: vi.fn().mockResolvedValue(docSnapshot),
    collection: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(chunksSnapshot),
      }),
    }),
  };

  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue(mockDocRef),
    }),
  };
}

describe("getChaptersByVideoId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Flat chapters (IAra format) ───

  it("returns chapters from flat document field (IAra format)", async () => {
    const db = createMockDb({
      docData: {
        chapters: [
          { timestamp: "00:00", title: "Introdução" },
          { timestamp: "05:30", title: "Desenvolvimento" },
          { timestamp: "1:30:00", title: "Encerramento" },
        ],
      },
    });

    vi.mocked(getFirestoreClient).mockResolvedValue(
      db as unknown as ReturnType<typeof getFirestoreClient>
    );

    const chapters = await getChaptersByVideoId("new-video");

    expect(chapters).toHaveLength(3);
    expect(chapters[0]).toEqual({ startTime: 0, topic: "Introdução" });
    expect(chapters[1]).toEqual({ startTime: 330, topic: "Desenvolvimento" });
    expect(chapters[2]).toEqual({ startTime: 5400, topic: "Encerramento" });
  });

  it("skips flat chapters with missing timestamp or title", async () => {
    const db = createMockDb({
      docData: {
        chapters: [
          { timestamp: "01:00", title: "Valid" },
          { timestamp: "", title: "No timestamp" },
          { timestamp: "02:00", title: "" },
          { timestamp: "03:00" }, // missing title
          { title: "No timestamp either" }, // missing timestamp
        ],
      },
    });

    vi.mocked(getFirestoreClient).mockResolvedValue(
      db as unknown as ReturnType<typeof getFirestoreClient>
    );

    const chapters = await getChaptersByVideoId("partial-video");

    expect(chapters).toHaveLength(1);
    expect(chapters[0].topic).toBe("Valid");
  });

  // ─── Legacy chunks sub-collection ───

  it("falls back to chunks sub-collection when flat chapters missing", async () => {
    const chunksSnapshot = {
      empty: false,
      docs: [
        {
          id: "chunk-0",
          data: () => ({
            metadata: {
              chunk_index: 0,
              topic: "Introdução",
              start_time: "00:00:15,730",
              end_time: "00:01:05,719",
            },
          }),
        },
        {
          id: "chunk-1",
          data: () => ({
            metadata: {
              chunk_index: 1,
              topic: "Desenvolvimento",
              start_time: "00:05:30,000",
              end_time: "00:10:00,000",
            },
          }),
        },
      ],
    };

    const db = createMockDb({
      docData: {}, // no chapters field
      chunksSnapshot,
    });

    vi.mocked(getFirestoreClient).mockResolvedValue(
      db as unknown as ReturnType<typeof getFirestoreClient>
    );

    const chapters = await getChaptersByVideoId("legacy-video");

    expect(chapters).toHaveLength(2);
    expect(chapters[0].topic).toBe("Introdução");
    expect(chapters[0].startTime).toBe(15.73);
    expect(chapters[1].topic).toBe("Desenvolvimento");
    expect(chapters[1].startTime).toBe(330);
  });

  it("falls back to chunks when flat chapters is empty array", async () => {
    const chunksSnapshot = {
      empty: false,
      docs: [
        {
          id: "chunk-0",
          data: () => ({
            metadata: {
              chunk_index: 0,
              topic: "From chunks",
              start_time: "00:00:10,000",
            },
          }),
        },
      ],
    };

    const db = createMockDb({
      docData: { chapters: [] },
      chunksSnapshot,
    });

    vi.mocked(getFirestoreClient).mockResolvedValue(
      db as unknown as ReturnType<typeof getFirestoreClient>
    );

    const chapters = await getChaptersByVideoId("empty-chapters-video");

    expect(chapters).toHaveLength(1);
    expect(chapters[0].topic).toBe("From chunks");
  });

  // ─── No chapters at all ───

  it("returns empty array when no chapters exist anywhere", async () => {
    const db = createMockDb({
      docData: {},
    });

    vi.mocked(getFirestoreClient).mockResolvedValue(
      db as unknown as ReturnType<typeof getFirestoreClient>
    );

    const chapters = await getChaptersByVideoId("no-chapters-video");

    expect(chapters).toEqual([]);
  });

  it("returns empty array when document does not exist", async () => {
    const db = createMockDb({ docData: null });

    vi.mocked(getFirestoreClient).mockResolvedValue(
      db as unknown as ReturnType<typeof getFirestoreClient>
    );

    const chapters = await getChaptersByVideoId("nonexistent-video");

    expect(chapters).toEqual([]);
  });

  // ─── Error handling ───

  it("returns empty array on Firestore error", async () => {
    vi.mocked(getFirestoreClient).mockRejectedValue(
      new Error("Firestore unavailable")
    );

    const chapters = await getChaptersByVideoId("error-video");

    expect(chapters).toEqual([]);
  });

  it("returns empty array for empty or whitespace videoId", async () => {
    expect(await getChaptersByVideoId("")).toEqual([]);
    expect(await getChaptersByVideoId("   ")).toEqual([]);
  });

  // ─── Legacy: skips invalid chunks ───

  it("skips legacy chunks with missing metadata", async () => {
    const chunksSnapshot = {
      empty: false,
      docs: [
        {
          id: "valid",
          data: () => ({
            metadata: {
              chunk_index: 0,
              topic: "Valid",
              start_time: "00:00:10,000",
            },
          }),
        },
        {
          id: "invalid",
          data: () => ({
            metadata: { chunk_index: 1 },
          }),
        },
      ],
    };

    const db = createMockDb({
      docData: {},
      chunksSnapshot,
    });

    vi.mocked(getFirestoreClient).mockResolvedValue(
      db as unknown as ReturnType<typeof getFirestoreClient>
    );

    const chapters = await getChaptersByVideoId("partial-chunks-video");

    expect(chapters).toHaveLength(1);
    expect(chapters[0].topic).toBe("Valid");
  });

  // ─── Flat chapters take priority ───

  it("prefers flat chapters over legacy chunks when both exist", async () => {
    const chunksSnapshot = {
      empty: false,
      docs: [
        {
          id: "chunk-0",
          data: () => ({
            metadata: {
              chunk_index: 0,
              topic: "Legacy chapter",
              start_time: "00:00:10,000",
            },
          }),
        },
      ],
    };

    const db = createMockDb({
      docData: {
        chapters: [{ timestamp: "01:00", title: "IAra chapter" }],
      },
      chunksSnapshot,
    });

    vi.mocked(getFirestoreClient).mockResolvedValue(
      db as unknown as ReturnType<typeof getFirestoreClient>
    );

    const chapters = await getChaptersByVideoId("both-sources-video");

    expect(chapters).toHaveLength(1);
    expect(chapters[0].topic).toBe("IAra chapter");
  });
});
