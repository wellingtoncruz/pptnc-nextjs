import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { RelatedEpisodes } from "./related-episodes";
import type { Episode } from "@/types";

const createMockEpisode = (overrides: Partial<Episode> = {}): Episode => ({
  id: "ep-1",
  slug: "test-episode",
  title: "Test Episode Title",
  description: "Test description",
  thumbnailUrl: "https://example.com/thumb.jpg",
  youtubeId: "abc123",
  publishedAt: new Date("2024-01-15T10:00:00Z"),
  duration: 3600,
  topics: ["Tech", "Programming"],
  guests: [],
  thumbnails: {
    default: { url: "", width: 0, height: 0 },
    medium: { url: "", width: 0, height: 0 },
    high: { url: "", width: 0, height: 0 },
  },
  statistics: {
    viewCount: "0",
    likeCount: "0",
    commentCount: "0",
    favoriteCount: "0",
  },
  contentDetails: {
    duration: "",
    dimension: "2d",
    definition: "hd",
    caption: "false",
    licensedContent: false,
    projection: "rectangular",
    contentRating: {},
  },
  channelId: "",
  channelTitle: "",
  playlistId: "",
  position: 0,
  ...overrides,
});

describe("RelatedEpisodes", () => {
  it("renders section with title and episode cards", () => {
    const episodes = [
      createMockEpisode({ id: "ep-1", title: "Episode 1", slug: "episode-1" }),
      createMockEpisode({ id: "ep-2", title: "Episode 2", slug: "episode-2" }),
    ];

    render(<RelatedEpisodes episodes={episodes} />);

    expect(
      screen.getByRole("heading", { name: /episódios relacionados/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Episode 1")).toBeInTheDocument();
    expect(screen.getByText("Episode 2")).toBeInTheDocument();
  });

  it("does not render when episodes array is empty", () => {
    const { container } = render(<RelatedEpisodes episodes={[]} />);

    expect(container.firstChild).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /episódios relacionados/i })
    ).not.toBeInTheDocument();
  });

  it("renders correct number of episode cards", () => {
    const episodes = [
      createMockEpisode({ id: "ep-1", title: "Episode 1", slug: "episode-1" }),
      createMockEpisode({ id: "ep-2", title: "Episode 2", slug: "episode-2" }),
      createMockEpisode({ id: "ep-3", title: "Episode 3", slug: "episode-3" }),
      createMockEpisode({ id: "ep-4", title: "Episode 4", slug: "episode-4" }),
    ];

    render(<RelatedEpisodes episodes={episodes} />);

    // Each card has a link to the episode
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
  });

  it("links episode cards to correct episode pages", () => {
    const episodes = [
      createMockEpisode({ id: "ep-1", title: "Episode 1", slug: "my-episode" }),
    ];

    render(<RelatedEpisodes episodes={episodes} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/episodios/my-episode");
  });

  it("applies custom className", () => {
    const episodes = [
      createMockEpisode({ id: "ep-1", title: "Episode 1", slug: "episode-1" }),
    ];

    render(<RelatedEpisodes episodes={episodes} className="custom-class" />);

    const section = screen.getByRole("region", {
      name: /episódios relacionados/i,
    });
    expect(section).toHaveClass("custom-class");
  });

  it("has correct accessibility attributes", () => {
    const episodes = [
      createMockEpisode({ id: "ep-1", title: "Episode 1", slug: "episode-1" }),
    ];

    render(<RelatedEpisodes episodes={episodes} />);

    const section = screen.getByRole("region", {
      name: /episódios relacionados/i,
    });
    expect(section).toHaveAttribute(
      "aria-labelledby",
      "related-episodes-title"
    );

    const heading = screen.getByRole("heading", {
      name: /episódios relacionados/i,
    });
    expect(heading).toHaveAttribute("id", "related-episodes-title");
  });
});
