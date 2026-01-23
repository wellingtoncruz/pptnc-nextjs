import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { EpisodeHeader } from "./episode-header";

import type { Episode } from "@/types";

const createMockEpisode = (overrides?: Partial<Episode>): Episode => ({
  id: "abc123",
  slug: "test-episode",
  title: "Test Episode Title",
  description: "This is a test description for the episode.",
  publishedAt: new Date("2026-01-15T10:00:00Z"),
  duration: 3700, // 1h 1min 40s
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

describe("EpisodeHeader", () => {
  it("renders episode title", () => {
    const episode = createMockEpisode();
    render(<EpisodeHeader episode={episode} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Test Episode Title"
    );
  });

  it("renders publication date formatted", () => {
    const episode = createMockEpisode();
    render(<EpisodeHeader episode={episode} />);

    // formatDate returns localized date - check for presence of date components
    // Format may vary by locale: "15 jan 2026", "15 de jan. de 2026", etc.
    expect(screen.getByText(/15.*jan.*2026/i)).toBeInTheDocument();
  });

  it("renders duration when greater than 0", () => {
    const episode = createMockEpisode({ duration: 3700 });
    render(<EpisodeHeader episode={episode} />);

    // formatDuration returns "1h 1min" format for 3700 seconds
    expect(screen.getByText("1h 1min")).toBeInTheDocument();
  });

  it("hides duration when 0", () => {
    const episode = createMockEpisode({ duration: 0 });
    render(<EpisodeHeader episode={episode} />);

    // Duration separator bullet should not be rendered when duration is 0
    const bullets = screen.queryAllByText("•");
    expect(bullets).toHaveLength(0);
  });

  it("renders topics as badges", () => {
    const episode = createMockEpisode({ topics: ["tech", "ai", "podcast"] });
    render(<EpisodeHeader episode={episode} />);

    expect(screen.getByText("tech")).toBeInTheDocument();
    expect(screen.getByText("ai")).toBeInTheDocument();
    expect(screen.getByText("podcast")).toBeInTheDocument();
  });

  it("renders topic badges as clickable links to filtered episode list", () => {
    const episode = createMockEpisode({ topics: ["tech", "ai"] });
    render(<EpisodeHeader episode={episode} />);

    const techLink = screen.getByRole("link", { name: "tech" });
    const aiLink = screen.getByRole("link", { name: "ai" });

    expect(techLink).toHaveAttribute("href", "/episodios?topic=tech");
    expect(aiLink).toHaveAttribute("href", "/episodios?topic=ai");
  });

  it("encodes special characters in topic link URLs", () => {
    const episode = createMockEpisode({ topics: ["C# & .NET"] });
    render(<EpisodeHeader episode={episode} />);

    const link = screen.getByRole("link", { name: "C# & .NET" });
    expect(link).toHaveAttribute("href", "/episodios?topic=C%23%20%26%20.NET");
  });

  it("hides topics section when no topics", () => {
    const episode = createMockEpisode({ topics: [] });
    const { container } = render(<EpisodeHeader episode={episode} />);

    // No badges should be rendered - query by data-slot attribute
    const badges = container.querySelectorAll('[data-slot="badge"]');
    expect(badges).toHaveLength(0);
  });

  it("renders thumbnail image when available", () => {
    const episode = createMockEpisode({
      thumbnailUrl: "https://example.com/thumb.jpg",
    });
    render(<EpisodeHeader episode={episode} />);

    const image = screen.getByRole("img");
    expect(image).toHaveAttribute("alt", "Test Episode Title");
  });

  it("uses YouTube default thumbnail when thumbnailUrl is empty", () => {
    // When thumbnailUrl is empty, YouTubeEmbed uses YouTube's default thumbnail
    const episode = createMockEpisode({ thumbnailUrl: "" });
    render(<EpisodeHeader episode={episode} />);

    // Should show play button (YouTubeEmbed in thumbnail state)
    expect(screen.getByRole("button")).toBeInTheDocument();
    // The image should use YouTube's default thumbnail based on youtubeId
    // Next.js Image component transforms the URL, so we check for the encoded version
    const img = screen.getByRole("img");
    expect(img.getAttribute("src")).toContain("img.youtube.com");
    expect(img.getAttribute("src")).toContain("abc123");
  });

  it("shows video unavailable when youtubeId is missing", () => {
    // When youtubeId is empty, YouTubeEmbed shows fallback message
    const episode = createMockEpisode({
      youtubeId: "",
      thumbnailUrl: "",
    });
    render(<EpisodeHeader episode={episode} />);

    expect(screen.getByText("Video nao disponivel")).toBeInTheDocument();
  });

});
