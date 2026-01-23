import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Episode } from "@/types";

// Mock datastore before importing the page
vi.mock("@/lib/datastore/episodes", () => ({
  getEpisodeBySlug: vi.fn(),
  getEpisodeBySlugWithTranscript: vi.fn(),
  getEpisodes: vi.fn(),
  getRelatedEpisodes: vi.fn().mockResolvedValue([]),
}));

// Mock chunks datastore
vi.mock("@/lib/datastore/chunks", () => ({
  getChaptersByVideoId: vi.fn().mockResolvedValue([]),
}));

// Mock Next.js navigation - notFound throws to stop execution like the real one
const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
}));

// Import after mocks are set up
import EpisodePage, { generateStaticParams, generateMetadata } from "./page";
import {
  getEpisodeBySlug,
  getEpisodeBySlugWithTranscript,
  getEpisodes,
} from "@/lib/datastore/episodes";

const createMockEpisode = (overrides?: Partial<Episode>): Episode => ({
  id: "abc123",
  slug: "test-episode",
  title: "Test Episode Title",
  description: "This is a test description for the episode.",
  publishedAt: new Date("2026-01-15T10:00:00Z"),
  duration: 3700,
  youtubeId: "abc123",
  thumbnailUrl: "https://example.com/thumb.jpg",
  thumbnails: {
    default: { url: "https://example.com/default.jpg", width: 120, height: 90 },
    medium: { url: "https://example.com/medium.jpg", width: 320, height: 180 },
    high: { url: "https://example.com/high.jpg", width: 480, height: 360 },
  },
  topics: ["tech", "ai"],
  guests: [],
  channelId: "channel123",
  channelTitle: "PPT Nao Compila",
  playlistId: "playlist123",
  position: 1,
  statistics: {
    commentCount: "100",
    favoriteCount: "50",
    viewCount: "10000",
    likeCount: "500",
  },
  contentDetails: {
    caption: "false",
    dimension: "2d",
    duration: "PT1H1M40S",
    definition: "hd",
    contentRating: {},
    projection: "rectangular",
    licensedContent: false,
  },
  ...overrides,
});

// Default search params for tests
const defaultSearchParams = Promise.resolve({});

describe("EpisodePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders episode title and description", async () => {
    const mockEpisode = createMockEpisode();
    vi.mocked(getEpisodeBySlugWithTranscript).mockResolvedValue(mockEpisode);

    const Page = await EpisodePage({
      params: Promise.resolve({ slug: "test-episode" }),
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.getByText("Test Episode Title")).toBeInTheDocument();
    expect(
      screen.getByText("This is a test description for the episode.")
    ).toBeInTheDocument();
  });

  it("renders episode topics", async () => {
    const mockEpisode = createMockEpisode({ topics: ["tech", "ai"] });
    vi.mocked(getEpisodeBySlugWithTranscript).mockResolvedValue(mockEpisode);

    const Page = await EpisodePage({
      params: Promise.resolve({ slug: "test-episode" }),
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.getByText("tech")).toBeInTheDocument();
    expect(screen.getByText("ai")).toBeInTheDocument();
  });

  it("calls notFound for invalid slug", async () => {
    vi.mocked(getEpisodeBySlugWithTranscript).mockResolvedValue(null);

    await expect(
      EpisodePage({
        params: Promise.resolve({ slug: "invalid-slug" }),
        searchParams: defaultSearchParams,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockNotFound).toHaveBeenCalled();
  });

  it("fetches episode by slug with transcript", async () => {
    const mockEpisode = createMockEpisode();
    vi.mocked(getEpisodeBySlugWithTranscript).mockResolvedValue(mockEpisode);

    const Page = await EpisodePage({
      params: Promise.resolve({ slug: "my-episode" }),
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(getEpisodeBySlugWithTranscript).toHaveBeenCalledWith("my-episode");
  });

  it("renders ContentTabs with description and transcript tabs", async () => {
    const mockEpisode = createMockEpisode({
      description: "Episode description here",
      transcriptSrt: `1
00:00:00,000 --> 00:00:05,000
Hello, welcome to the podcast!`,
    });
    vi.mocked(getEpisodeBySlugWithTranscript).mockResolvedValue(mockEpisode);

    const Page = await EpisodePage({
      params: Promise.resolve({ slug: "test-episode" }),
      searchParams: defaultSearchParams,
    });
    render(Page);

    // ContentTabs section should be present
    expect(screen.getByRole("region", { name: /conteúdo do episódio/i })).toBeInTheDocument();
    // Both tabs should be present
    expect(screen.getByRole("tab", { name: /descrição/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /transcrição/i })).toBeInTheDocument();
    // Both contents should be in DOM for SEO
    expect(screen.getByText("Episode description here")).toBeInTheDocument();
    expect(screen.getByText(/Hello, welcome to the podcast!/)).toBeInTheDocument();
  });

  it("renders only description tab when transcript is missing", async () => {
    const mockEpisode = createMockEpisode({
      description: "Episode description here",
      transcriptSrt: undefined,
    });
    vi.mocked(getEpisodeBySlugWithTranscript).mockResolvedValue(mockEpisode);

    const Page = await EpisodePage({
      params: Promise.resolve({ slug: "test-episode" }),
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.getByRole("tab", { name: /descrição/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /transcrição/i })).not.toBeInTheDocument();
  });

  it("does not render ContentTabs when both description and transcript are missing", async () => {
    const mockEpisode = createMockEpisode({
      description: undefined,
      transcriptSrt: undefined,
    });
    vi.mocked(getEpisodeBySlugWithTranscript).mockResolvedValue(mockEpisode);

    const Page = await EpisodePage({
      params: Promise.resolve({ slug: "test-episode" }),
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.queryByRole("region", { name: /conteúdo do episódio/i })).not.toBeInTheDocument();
  });
});

describe("generateStaticParams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns slugs for all episodes", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([
      createMockEpisode({ slug: "episode-1" }),
      createMockEpisode({ slug: "episode-2" }),
      createMockEpisode({ slug: "episode-3" }),
    ]);

    const params = await generateStaticParams();

    expect(params).toEqual([
      { slug: "episode-1" },
      { slug: "episode-2" },
      { slug: "episode-3" },
    ]);
  });

  it("returns empty array when no episodes", async () => {
    vi.mocked(getEpisodes).mockResolvedValue([]);

    const params = await generateStaticParams();

    expect(params).toEqual([]);
  });
});

describe("generateMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns proper metadata for valid episode", async () => {
    const mockEpisode = createMockEpisode({
      title: "My Episode Title",
      description: "My episode description",
      slug: "my-episode",
      thumbnailUrl: "https://example.com/thumb.jpg",
    });
    vi.mocked(getEpisodeBySlug).mockResolvedValue(mockEpisode);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "my-episode" }),
      searchParams: defaultSearchParams,
    });

    expect(metadata.title).toBe("My Episode Title");
    expect(metadata.description).toBe("My episode description");
    expect(metadata.openGraph?.title).toBe("My Episode Title");
    expect(metadata.openGraph?.description).toBe("My episode description");
  });

  it("truncates long descriptions at word boundary", async () => {
    const longDescription =
      "This is a very long description that exceeds 160 characters. It needs to be truncated for SEO purposes because meta descriptions should be concise and to the point for search engines to display properly.";
    const mockEpisode = createMockEpisode({ description: longDescription });
    vi.mocked(getEpisodeBySlug).mockResolvedValue(mockEpisode);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "test" }),
      searchParams: defaultSearchParams,
    });

    // Should truncate at word boundary, not exceed 160 chars
    expect(metadata.description!.length).toBeLessThanOrEqual(160);
    // Should contain expected beginning of text
    expect(metadata.description).toContain("This is a very long description");
    // Should end with complete word (no trailing space, no cut word)
    expect(metadata.description).toMatch(/\w$/);
  });

  it("returns fallback title for invalid episode", async () => {
    vi.mocked(getEpisodeBySlug).mockResolvedValue(null);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "invalid" }),
      searchParams: defaultSearchParams,
    });

    expect(metadata.title).toBe("Episodio nao encontrado");
  });

  it("uses fallback og-image when no thumbnail", async () => {
    const mockEpisode = createMockEpisode({ thumbnailUrl: "" });
    vi.mocked(getEpisodeBySlug).mockResolvedValue(mockEpisode);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "test" }),
      searchParams: defaultSearchParams,
    });

    const ogImages = metadata.openGraph?.images as Array<{ url: string }>;
    expect(ogImages?.[0]?.url).toBe("/og-image.png");
  });

  it("generates fallback description when missing", async () => {
    const mockEpisode = createMockEpisode({
      title: "Episode Title",
      description: "",
    });
    vi.mocked(getEpisodeBySlug).mockResolvedValue(mockEpisode);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "test" }),
      searchParams: defaultSearchParams,
    });

    expect(metadata.description).toBe(
      "Assista ao episodio Episode Title do PPT Nao Compila"
    );
  });

  it("includes Twitter card metadata", async () => {
    const mockEpisode = createMockEpisode();
    vi.mocked(getEpisodeBySlug).mockResolvedValue(mockEpisode);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "test" }),
      searchParams: defaultSearchParams,
    });

    expect(metadata.twitter?.card).toBe("summary_large_image");
    expect(metadata.twitter?.title).toBe(mockEpisode.title);
  });
});
