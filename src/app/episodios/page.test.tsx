import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the datastore module
vi.mock("@/lib/datastore/episodes", () => ({
  getEpisodes: vi.fn(),
  getEpisodesCount: vi.fn(),
  getEpisodesByTopic: vi.fn(),
  getEpisodesCountByTopic: vi.fn(),
  getAllTopics: vi.fn(),
}));

// Mock the EpisodeCard component
vi.mock("@/components/episode/episode-card", () => ({
  EpisodeCard: ({ episode, variant }: { episode: { title: string }; variant: string }) => (
    <div data-testid="episode-card" data-variant={variant}>
      {episode.title}
    </div>
  ),
}));

// Mock the TopicFilter component
vi.mock("@/components/episode/topic-filter", () => ({
  TopicFilter: ({ topics, activeTopic }: { topics: string[]; activeTopic?: string }) => (
    <div data-testid="topic-filter" data-active={activeTopic}>
      {topics.map((t) => (
        <span key={t} data-testid="topic-badge">{t}</span>
      ))}
    </div>
  ),
}));

import {
  getEpisodes,
  getEpisodesCount,
  getEpisodesByTopic,
  getEpisodesCountByTopic,
  getAllTopics,
} from "@/lib/datastore/episodes";
import EpisodesPage from "./page";

const mockGetEpisodes = vi.mocked(getEpisodes);
const mockGetEpisodesCount = vi.mocked(getEpisodesCount);
const mockGetEpisodesByTopic = vi.mocked(getEpisodesByTopic);
const mockGetEpisodesCountByTopic = vi.mocked(getEpisodesCountByTopic);
const mockGetAllTopics = vi.mocked(getAllTopics);

// Helper to create mock episodes
const createMockEpisode = (id: string, title: string) => ({
  id,
  slug: `episode-${id}`,
  title,
  description: "Test description",
  publishedAt: new Date("2026-01-12T12:00:00Z"),
  duration: 3600,
  youtubeId: id,
  thumbnails: {
    default: { url: "", width: 120, height: 90 },
    medium: { url: "", width: 320, height: 180 },
    high: { url: "", width: 480, height: 360 },
  },
  thumbnailUrl: "https://example.com/thumb.jpg",
  channelId: "channel-1",
  channelTitle: "Test Channel",
  playlistId: "playlist-1",
  position: 0,
  statistics: {
    commentCount: "0",
    favoriteCount: "0",
    viewCount: "100",
    likeCount: "10",
  },
  contentDetails: {
    caption: "false",
    dimension: "2d",
    duration: "PT1H",
    definition: "hd",
    contentRating: {},
    projection: "rectangular",
    licensedContent: false,
  },
  guests: [],
  topics: [],
});

describe("EpisodesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no topics available
    mockGetAllTopics.mockResolvedValue([]);
  });

  it("renders episode list with cards", async () => {
    const mockEpisodes = [
      createMockEpisode("1", "Episode One"),
      createMockEpisode("2", "Episode Two"),
      createMockEpisode("3", "Episode Three"),
    ];
    mockGetEpisodes.mockResolvedValue(mockEpisodes);
    mockGetEpisodesCount.mockResolvedValue(3);

    const searchParams = Promise.resolve({});
    const page = await EpisodesPage({ searchParams });
    render(page);

    expect(screen.getByRole("heading", { name: "Episódios" })).toBeInTheDocument();
    expect(screen.getAllByTestId("episode-card")).toHaveLength(3);
    expect(screen.getByText("Episode One")).toBeInTheDocument();
    expect(screen.getByText("Episode Two")).toBeInTheDocument();
  });

  it("renders episode cards with compact variant", async () => {
    const mockEpisodes = [createMockEpisode("1", "Test Episode")];
    mockGetEpisodes.mockResolvedValue(mockEpisodes);
    mockGetEpisodesCount.mockResolvedValue(1);

    const searchParams = Promise.resolve({});
    const page = await EpisodesPage({ searchParams });
    render(page);

    const card = screen.getByTestId("episode-card");
    expect(card).toHaveAttribute("data-variant", "compact");
  });

  it("renders empty state when no episodes exist", async () => {
    mockGetEpisodes.mockResolvedValue([]);
    mockGetEpisodesCount.mockResolvedValue(0);

    const searchParams = Promise.resolve({});
    const page = await EpisodesPage({ searchParams });
    render(page);

    expect(screen.getByText("Nenhum episódio ainda")).toBeInTheDocument();
    expect(screen.getByText("Voltar para Home")).toBeInTheDocument();
    expect(screen.queryAllByTestId("episode-card")).toHaveLength(0);
  });

  it("renders pagination when more than one page exists", async () => {
    const mockEpisodes = Array.from({ length: 12 }, (_, i) =>
      createMockEpisode(`${i + 1}`, `Episode ${i + 1}`)
    );
    mockGetEpisodes.mockResolvedValue(mockEpisodes);
    mockGetEpisodesCount.mockResolvedValue(24); // 2 pages

    const searchParams = Promise.resolve({});
    const page = await EpisodesPage({ searchParams });
    render(page);

    expect(screen.getByRole("navigation", { name: "Paginação de episódios" })).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Próxima" })).toBeInTheDocument();
  });

  it("does not render pagination for single page", async () => {
    const mockEpisodes = [createMockEpisode("1", "Only Episode")];
    mockGetEpisodes.mockResolvedValue(mockEpisodes);
    mockGetEpisodesCount.mockResolvedValue(1);

    const searchParams = Promise.resolve({});
    const page = await EpisodesPage({ searchParams });
    render(page);

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("shows episode count text", async () => {
    const mockEpisodes = Array.from({ length: 5 }, (_, i) =>
      createMockEpisode(`${i + 1}`, `Episode ${i + 1}`)
    );
    mockGetEpisodes.mockResolvedValue(mockEpisodes);
    mockGetEpisodesCount.mockResolvedValue(5);

    const searchParams = Promise.resolve({});
    const page = await EpisodesPage({ searchParams });
    render(page);

    expect(screen.getByText(/Mostrando 1-5 de 5 episódios/)).toBeInTheDocument();
  });

  it("handles page parameter correctly", async () => {
    const mockEpisodes = Array.from({ length: 12 }, (_, i) =>
      createMockEpisode(`${i + 13}`, `Episode ${i + 13}`)
    );
    mockGetEpisodes.mockResolvedValue(mockEpisodes);
    mockGetEpisodesCount.mockResolvedValue(24);

    const searchParams = Promise.resolve({ page: "2" });
    const page = await EpisodesPage({ searchParams });
    render(page);

    // Should show page 2 of 2
    expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();
    expect(mockGetEpisodes).toHaveBeenCalledWith({ limit: 12, offset: 12 });
  });

  it("handles invalid page parameter gracefully", async () => {
    mockGetEpisodes.mockResolvedValue([]);
    mockGetEpisodesCount.mockResolvedValue(12);

    const searchParams = Promise.resolve({ page: "abc" });
    const page = await EpisodesPage({ searchParams });
    render(page);

    // Should default to page 1
    expect(mockGetEpisodes).toHaveBeenCalledWith({ limit: 12, offset: 0 });
  });

  it("handles negative page parameter gracefully", async () => {
    mockGetEpisodes.mockResolvedValue([]);
    mockGetEpisodesCount.mockResolvedValue(12);

    const searchParams = Promise.resolve({ page: "-5" });
    const page = await EpisodesPage({ searchParams });
    render(page);

    // Should default to page 1
    expect(mockGetEpisodes).toHaveBeenCalledWith({ limit: 12, offset: 0 });
  });

  it("renders previous button disabled on first page", async () => {
    const mockEpisodes = [createMockEpisode("1", "Test")];
    mockGetEpisodes.mockResolvedValue(mockEpisodes);
    mockGetEpisodesCount.mockResolvedValue(24);

    const searchParams = Promise.resolve({});
    const page = await EpisodesPage({ searchParams });
    render(page);

    const prevButton = screen.getByRole("button", { name: "Anterior" });
    expect(prevButton).toBeDisabled();
  });

  it("renders next button disabled on last page", async () => {
    const mockEpisodes = [createMockEpisode("1", "Test")];
    mockGetEpisodes.mockResolvedValue(mockEpisodes);
    mockGetEpisodesCount.mockResolvedValue(24);

    const searchParams = Promise.resolve({ page: "2" });
    const page = await EpisodesPage({ searchParams });
    render(page);

    const nextButton = screen.getByRole("button", { name: "Próxima" });
    expect(nextButton).toBeDisabled();
  });

  describe("topic filtering", () => {
    it("renders topic filter when topics exist", async () => {
      mockGetEpisodes.mockResolvedValue([createMockEpisode("1", "Test")]);
      mockGetEpisodesCount.mockResolvedValue(1);
      mockGetAllTopics.mockResolvedValue(["Cloud", "DevOps", "Agilidade"]);

      const searchParams = Promise.resolve({});
      const page = await EpisodesPage({ searchParams });
      render(page);

      expect(screen.getByTestId("topic-filter")).toBeInTheDocument();
      expect(screen.getAllByTestId("topic-badge")).toHaveLength(3);
    });

    it("does not render topic filter when no topics exist", async () => {
      mockGetEpisodes.mockResolvedValue([createMockEpisode("1", "Test")]);
      mockGetEpisodesCount.mockResolvedValue(1);
      mockGetAllTopics.mockResolvedValue([]);

      const searchParams = Promise.resolve({});
      const page = await EpisodesPage({ searchParams });
      render(page);

      expect(screen.queryByTestId("topic-filter")).not.toBeInTheDocument();
    });

    it("fetches episodes by topic when topic param is present", async () => {
      const mockEpisodes = [createMockEpisode("1", "Topic Episode")];
      mockGetEpisodesByTopic.mockResolvedValue(mockEpisodes);
      mockGetEpisodesCountByTopic.mockResolvedValue(1);
      mockGetAllTopics.mockResolvedValue(["Cloud"]);

      const searchParams = Promise.resolve({ topic: "Cloud" });
      const page = await EpisodesPage({ searchParams });
      render(page);

      expect(mockGetEpisodesByTopic).toHaveBeenCalledWith("Cloud", { limit: 12, offset: 0 });
      expect(mockGetEpisodesCountByTopic).toHaveBeenCalledWith("Cloud");
      expect(mockGetEpisodes).not.toHaveBeenCalled();
    });

    it("shows topic name in episode count when filtered", async () => {
      mockGetEpisodesByTopic.mockResolvedValue([createMockEpisode("1", "Test")]);
      mockGetEpisodesCountByTopic.mockResolvedValue(5);
      mockGetAllTopics.mockResolvedValue(["Cloud"]);

      const searchParams = Promise.resolve({ topic: "Cloud" });
      const page = await EpisodesPage({ searchParams });
      render(page);

      expect(screen.getByText(/em "Cloud"/)).toBeInTheDocument();
    });

    it("shows empty state with topic message when no episodes match filter", async () => {
      mockGetEpisodesByTopic.mockResolvedValue([]);
      mockGetEpisodesCountByTopic.mockResolvedValue(0);
      mockGetAllTopics.mockResolvedValue(["Cloud"]);

      const searchParams = Promise.resolve({ topic: "Cloud" });
      const page = await EpisodesPage({ searchParams });
      render(page);

      expect(screen.getByText(/Nenhum episódio em "Cloud"/)).toBeInTheDocument();
      expect(screen.getByText("Ver todos os episódios")).toBeInTheDocument();
    });

    it("preserves topic param in pagination links", async () => {
      const mockEpisodes = Array.from({ length: 12 }, (_, i) =>
        createMockEpisode(`${i + 1}`, `Episode ${i + 1}`)
      );
      mockGetEpisodesByTopic.mockResolvedValue(mockEpisodes);
      mockGetEpisodesCountByTopic.mockResolvedValue(24);
      mockGetAllTopics.mockResolvedValue(["Cloud"]);

      const searchParams = Promise.resolve({ topic: "Cloud" });
      const page = await EpisodesPage({ searchParams });
      render(page);

      const nextLink = screen.getByRole("link", { name: "Próxima" });
      expect(nextLink).toHaveAttribute("href", "/episodios?page=2&topic=Cloud");
    });
  });
});
