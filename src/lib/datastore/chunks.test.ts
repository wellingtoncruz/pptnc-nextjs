import { describe, it, expect, vi, beforeEach } from "vitest";

import { getChaptersByVideoId } from "./chunks";

// Mock the Firestore client
vi.mock("./client", () => ({
  getFirestoreClient: vi.fn(),
  COLLECTION_EPISODES: "videos",
}));

// Mock the transcript module
vi.mock("@/lib/transcript", () => ({
  parseSrtTimestamp: vi.fn((srt: string) => {
    // Simple mock implementation
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

describe("getChaptersByVideoId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns chapters sorted by chunk_index", async () => {
    const mockSnapshot = {
      empty: false,
      docs: [
        {
          id: "chunk-0",
          data: () => ({
            metadata: {
              video_id: "test-video",
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
              video_id: "test-video",
              chunk_index: 1,
              topic: "Desenvolvimento",
              start_time: "00:05:30,000",
              end_time: "00:10:00,000",
            },
          }),
        },
      ],
    };

    const mockCollection = vi.fn().mockReturnThis();
    const mockDoc = vi.fn().mockReturnThis();
    const mockOrderBy = vi.fn().mockReturnThis();
    const mockGet = vi.fn().mockResolvedValue(mockSnapshot);

    vi.mocked(getFirestoreClient).mockResolvedValue({
      collection: mockCollection,
      doc: mockDoc,
      orderBy: mockOrderBy,
      get: mockGet,
    } as unknown as ReturnType<typeof getFirestoreClient>);

    // Override for chained calls
    mockCollection.mockReturnValue({
      doc: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            get: mockGet,
          }),
        }),
      }),
    });

    const chapters = await getChaptersByVideoId("test-video");

    expect(chapters).toHaveLength(2);
    expect(chapters[0].topic).toBe("Introdução");
    expect(chapters[0].startTime).toBe(15.73);
    expect(chapters[1].topic).toBe("Desenvolvimento");
    expect(chapters[1].startTime).toBe(330);
  });

  it("returns empty array when no chunks exist", async () => {
    const mockSnapshot = {
      empty: true,
      docs: [],
    };

    vi.mocked(getFirestoreClient).mockResolvedValue({
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue(mockSnapshot),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof getFirestoreClient>);

    const chapters = await getChaptersByVideoId("no-chunks-video");

    expect(chapters).toEqual([]);
  });

  it("returns empty array on Firestore error", async () => {
    vi.mocked(getFirestoreClient).mockRejectedValue(new Error("Firestore unavailable"));

    const chapters = await getChaptersByVideoId("error-video");

    expect(chapters).toEqual([]);
  });

  it("skips chunks with missing metadata", async () => {
    const mockSnapshot = {
      empty: false,
      docs: [
        {
          id: "valid-chunk",
          data: () => ({
            metadata: {
              chunk_index: 0,
              topic: "Valid",
              start_time: "00:00:10,000",
              end_time: "00:01:00,000",
            },
          }),
        },
        {
          id: "invalid-chunk",
          data: () => ({
            metadata: {
              chunk_index: 1,
              // Missing topic and start_time
            },
          }),
        },
      ],
    };

    vi.mocked(getFirestoreClient).mockResolvedValue({
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue(mockSnapshot),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof getFirestoreClient>);

    const chapters = await getChaptersByVideoId("partial-chunks-video");

    expect(chapters).toHaveLength(1);
    expect(chapters[0].topic).toBe("Valid");
  });

  it("skips chunks with missing start_time only", async () => {
    const mockSnapshot = {
      empty: false,
      docs: [
        {
          id: "missing-start-time",
          data: () => ({
            metadata: {
              chunk_index: 0,
              topic: "Has topic but no time",
              // Missing start_time
              end_time: "00:01:00,000",
            },
          }),
        },
      ],
    };

    vi.mocked(getFirestoreClient).mockResolvedValue({
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue(mockSnapshot),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof getFirestoreClient>);

    const chapters = await getChaptersByVideoId("missing-start-time-video");

    expect(chapters).toEqual([]);
  });

  it("skips chunks with missing topic only", async () => {
    const mockSnapshot = {
      empty: false,
      docs: [
        {
          id: "missing-topic",
          data: () => ({
            metadata: {
              chunk_index: 0,
              // Missing topic
              start_time: "00:00:10,000",
              end_time: "00:01:00,000",
            },
          }),
        },
      ],
    };

    vi.mocked(getFirestoreClient).mockResolvedValue({
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue(mockSnapshot),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof getFirestoreClient>);

    const chapters = await getChaptersByVideoId("missing-topic-video");

    expect(chapters).toEqual([]);
  });

  it("returns empty array for empty or whitespace videoId", async () => {
    expect(await getChaptersByVideoId("")).toEqual([]);
    expect(await getChaptersByVideoId("   ")).toEqual([]);
  });
});
